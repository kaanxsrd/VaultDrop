import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { DEFAULT_MAX_FAILED_ATTEMPTS, type Plan } from "@/config/plans";
import { type Envelope, type KdfParams, validateKdfParams } from "@/lib/crypto/envelope";
import { type CreateSecretInput, createSecretSchema } from "@/lib/validation/secrets";
import {
  newSecretId,
  receiptTokenFor,
  safeEqual,
  sha256,
  verifyReceiptToken,
} from "@/server/crypto";
import { getDb, type Transaction } from "@/server/db/client";
import { secretPayloads, secrets } from "@/server/db/schema";
import { consumeQuota } from "@/server/entitlements";
import { AppError } from "@/server/errors";
import { emitSecretEvent, type SecretEventData } from "@/server/events";

/**
 * Secret lifecycle.
 *
 *   active ──redeem (last view)──▶ consumed
 *     │  └──redeem (more views left)──▶ active (view_count + 1)
 *     ├──expires_at passed (lazily on access, or by cleanup job)──▶ expired
 *     └──burn by owner/receipt, or too many failed proofs──▶ revoked
 *
 * consumed / expired / revoked are terminal: every transition is a conditional UPDATE guarded by
 * `state = 'active'`, so no code path can move a secret back to active. Payload rows are deleted
 * in the same transaction that leaves `active`.
 */

export type SecretOwner = {
  userId: string | null;
  organizationId: string | null;
  apiKeyId: string | null;
  environment: "live" | "test";
};

export type Clock = () => Date;
const systemClock: Clock = () => new Date();

export interface CreatedSecret {
  id: string;
  expiresAt: Date;
  maxViews: number;
  receiptToken: string;
}

export async function createSecret(
  rawInput: CreateSecretInput,
  ctx: { owner: SecretOwner; plan: Plan; clock?: Clock },
): Promise<CreatedSecret> {
  const parsed = createSecretSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("validation_failed", "The request is invalid.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;
  const { plan, owner } = ctx;
  const limits = plan.limits;
  const now = (ctx.clock ?? systemClock)();

  const ciphertextBytes = Math.floor((input.envelope.ct.length * 3) / 4);
  if (ciphertextBytes > limits.maxCiphertextBytes) {
    throw new AppError(
      "payload_too_large",
      `Secrets on the ${plan.name} plan are limited to ${Math.floor(limits.maxCiphertextBytes / 1024)} KiB.`,
      {
        maxBytes: limits.maxCiphertextBytes,
      },
    );
  }
  if (input.expiresIn > limits.maxExpirySeconds) {
    throw new AppError(
      "plan_restricted",
      `The ${plan.name} plan allows expiry up to ${Math.floor(limits.maxExpirySeconds / 86400)} days.`,
      {
        maxExpirySeconds: limits.maxExpirySeconds,
      },
    );
  }
  if (input.maxViews > limits.maxViews) {
    throw new AppError(
      "plan_restricted",
      `The ${plan.name} plan allows up to ${limits.maxViews} view(s) per secret.`,
      { maxViews: limits.maxViews },
    );
  }
  if (input.label && !limits.labels) {
    throw new AppError("plan_restricted", "Labels are available to signed-in users.");
  }
  if (input.kdf && !validateKdfParams(input.kdf as KdfParams)) {
    throw new AppError("validation_failed", "Unsupported key-derivation parameters.");
  }

  const id = newSecretId();
  const expiresAt = new Date(now.getTime() + input.expiresIn * 1000);
  const db = await getDb();

  await db.transaction(async (tx) => {
    if (owner.userId && limits.secretsPerMonth !== null) {
      const subject = owner.organizationId ? `org:${owner.organizationId}` : `user:${owner.userId}`;
      await consumeQuota(tx, subject, "secrets_created", limits.secretsPerMonth, now);
    }
    await tx.insert(secrets).values({
      id,
      state: "active",
      createdAt: now,
      expiresAt,
      verifier: input.verifier,
      kdf: input.kdf as KdfParams | null,
      maxViews: input.maxViews,
      maxFailedAttempts: input.maxFailedAttempts ?? DEFAULT_MAX_FAILED_ATTEMPTS,
      sizeBytes: ciphertextBytes,
      label: input.label ?? null,
      ownerUserId: owner.userId,
      organizationId: owner.organizationId,
      apiKeyId: owner.apiKeyId,
      environment: owner.environment,
    });
    await tx.insert(secretPayloads).values({
      secretId: id,
      version: input.envelope.v,
      iv: input.envelope.iv,
      ciphertext: input.envelope.ct,
    });
    await emitSecretEvent(
      tx,
      owner,
      "secret.created",
      eventData({
        id,
        label: input.label ?? null,
        state: "active",
        viewCount: 0,
        maxViews: input.maxViews,
        expiresAt,
        environment: owner.environment,
      }),
      now,
    );
  });

  return { id, expiresAt, maxViews: input.maxViews, receiptToken: receiptTokenFor(id) };
}

function eventData(row: {
  id: string;
  label: string | null;
  state: SecretEventData["state"];
  viewCount: number;
  maxViews: number;
  expiresAt: Date;
  environment: "live" | "test";
}): SecretEventData {
  return {
    secretId: row.id,
    label: row.label,
    state: row.state,
    viewCount: row.viewCount,
    maxViews: row.maxViews,
    expiresAt: row.expiresAt.toISOString(),
    environment: row.environment,
  };
}

export type PublicSecretState = "active" | "consumed" | "expired" | "revoked";

export interface SecretStatus {
  state: PublicSecretState;
  requiresPassphrase: boolean;
  /** Present only while active: the recipient needs it to derive keys before redeeming. */
  kdf: KdfParams | null;
  expiresAt: string | null;
  viewsRemaining: number;
}

/** Recipient-facing pre-redemption status. Never returns ciphertext, labels or owner data. */
export async function getSecretStatus(
  id: string,
  clock: Clock = systemClock,
): Promise<SecretStatus | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      state: secrets.state,
      kdf: secrets.kdf,
      expiresAt: secrets.expiresAt,
      maxViews: secrets.maxViews,
      viewCount: secrets.viewCount,
    })
    .from(secrets)
    .where(eq(secrets.id, id))
    .limit(1);
  if (!row) return null;
  const expired = row.state === "active" && row.expiresAt <= clock();
  const state: PublicSecretState = expired ? "expired" : row.state;
  const active = state === "active";
  return {
    state,
    requiresPassphrase: active && row.kdf !== null,
    kdf: active ? row.kdf : null,
    expiresAt: active ? row.expiresAt.toISOString() : null,
    viewsRemaining: active ? row.maxViews - row.viewCount : 0,
  };
}

export type RedeemResult =
  | { ok: true; envelope: Envelope; viewsRemaining: number }
  | { ok: false; reason: "not_found" | "consumed" | "expired" | "revoked" }
  | { ok: false; reason: "invalid_proof"; attemptsRemaining: number }
  | { ok: false; reason: "locked" };

class ClaimLost extends Error {}

/**
 * Redeems a secret. This is the only code path that releases ciphertext.
 *
 * Consumption takes effect when this transaction commits. The row is locked (SELECT … FOR UPDATE)
 * and every write is additionally conditioned on the state/view count read under that lock, so two
 * concurrent redemptions can never both succeed for the same view, on any isolation level.
 * A wrong proof only increments `failed_attempts` (it never consumes); after `max_failed_attempts`
 * the secret is revoked to stop online guessing.
 */
export async function redeemSecret(
  id: string,
  proof: string,
  clock: Clock = systemClock,
): Promise<RedeemResult> {
  const db = await getDb();
  const now = clock();
  try {
    return await db.transaction(async (tx) => redeemInTx(tx, id, proof, now));
  } catch (error) {
    if (error instanceof ClaimLost) return { ok: false, reason: "consumed" };
    throw error;
  }
}

async function redeemInTx(
  tx: Transaction,
  id: string,
  proof: string,
  now: Date,
): Promise<RedeemResult> {
  const [row] = await tx.select().from(secrets).where(eq(secrets.id, id)).for("update").limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.state !== "active") return { ok: false, reason: row.state };
  const owner = { userId: row.ownerUserId, organizationId: row.organizationId };

  if (row.expiresAt <= now) {
    await transitionOut(tx, id, { state: "expired", expiredAt: now });
    await emitSecretEvent(
      tx,
      owner,
      "secret.expired",
      eventData({ ...row, state: "expired" }),
      now,
    );
    return { ok: false, reason: "expired" };
  }

  if (!safeEqual(sha256(Buffer.from(proof, "base64url")), row.verifier)) {
    const attempts = row.failedAttempts + 1;
    if (attempts >= row.maxFailedAttempts) {
      await transitionOut(tx, id, {
        state: "revoked",
        revokedAt: now,
        revokeReason: "attempts_exceeded",
        failedAttempts: attempts,
      });
      await emitSecretEvent(
        tx,
        owner,
        "secret.revoked",
        eventData({ ...row, state: "revoked" }),
        now,
      );
      return { ok: false, reason: "locked" };
    }
    await tx
      .update(secrets)
      .set({ failedAttempts: sql`${secrets.failedAttempts} + 1` })
      .where(and(eq(secrets.id, id), eq(secrets.state, "active")));
    return {
      ok: false,
      reason: "invalid_proof",
      attemptsRemaining: row.maxFailedAttempts - attempts,
    };
  }

  const viewCount = row.viewCount + 1;
  const isFinal = viewCount >= row.maxViews;
  const claimed = await tx
    .update(secrets)
    .set(
      isFinal
        ? { state: "consumed", viewCount, consumedAt: now, lastViewedAt: now }
        : { viewCount, lastViewedAt: now },
    )
    .where(
      and(eq(secrets.id, id), eq(secrets.state, "active"), eq(secrets.viewCount, row.viewCount)),
    )
    .returning({ id: secrets.id });
  if (claimed.length !== 1) throw new ClaimLost();

  const [payload] = isFinal
    ? await tx.delete(secretPayloads).where(eq(secretPayloads.secretId, id)).returning()
    : await tx.select().from(secretPayloads).where(eq(secretPayloads.secretId, id)).limit(1);
  if (!payload) {
    // Integrity failure: active secret without a payload. Roll back rather than report success.
    throw new Error("Secret payload missing for active secret");
  }

  await emitSecretEvent(
    tx,
    owner,
    isFinal ? "secret.consumed" : "secret.viewed",
    eventData({ ...row, state: isFinal ? "consumed" : "active", viewCount }),
    now,
  );

  return {
    ok: true,
    envelope: { v: payload.version as 1, iv: payload.iv, ct: payload.ciphertext },
    viewsRemaining: row.maxViews - viewCount,
  };
}

/** Moves an active secret to a terminal state and destroys its payload, atomically. */
async function transitionOut(
  tx: Transaction,
  id: string,
  set: Partial<typeof secrets.$inferInsert> & { state: "expired" | "revoked" | "consumed" },
): Promise<boolean> {
  const updated = await tx
    .update(secrets)
    .set(set)
    .where(and(eq(secrets.id, id), eq(secrets.state, "active")))
    .returning({ id: secrets.id });
  await tx.delete(secretPayloads).where(eq(secretPayloads.secretId, id));
  return updated.length === 1;
}

export type BurnAuthorization =
  | { kind: "receipt"; token: string }
  | { kind: "owner"; userId: string; organizationIds?: string[] }
  | { kind: "admin" };

/** Revokes ("burns") an active secret before it is read. Idempotent for already-terminal secrets. */
export async function burnSecret(
  id: string,
  auth: BurnAuthorization,
  clock: Clock = systemClock,
): Promise<{ state: PublicSecretState }> {
  const db = await getDb();
  const now = clock();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(secrets).where(eq(secrets.id, id)).for("update").limit(1);
    if (!row || !isAuthorizedToManage(row, auth)) {
      // Same response for "does not exist" and "not yours" to avoid leaking existence.
      throw new AppError("not_found", "Secret not found.");
    }
    if (row.state !== "active") return { state: row.state };
    if (row.expiresAt <= now) {
      await transitionOut(tx, id, { state: "expired", expiredAt: now });
      return { state: "expired" as const };
    }
    const reason = auth.kind === "receipt" ? "receipt" : auth.kind === "admin" ? "admin" : "owner";
    await transitionOut(tx, id, { state: "revoked", revokedAt: now, revokeReason: reason });
    await emitSecretEvent(
      tx,
      { userId: row.ownerUserId, organizationId: row.organizationId },
      "secret.revoked",
      eventData({ ...row, state: "revoked" }),
      now,
    );
    return { state: "revoked" as const };
  });
}

function isAuthorizedToManage(row: typeof secrets.$inferSelect, auth: BurnAuthorization): boolean {
  switch (auth.kind) {
    case "admin":
      return true;
    case "receipt":
      return verifyReceiptToken(row.id, auth.token);
    case "owner":
      return (
        (row.ownerUserId !== null &&
          row.ownerUserId === auth.userId &&
          row.organizationId === null) ||
        (row.organizationId !== null && (auth.organizationIds ?? []).includes(row.organizationId))
      );
  }
}

export interface ReceiptView {
  id: string;
  state: PublicSecretState;
  createdAt: string;
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  hasPassphrase: boolean;
  label: string | null;
  consumedAt: string | null;
  revokedAt: string | null;
}

/** Creator-facing metadata, authorized by receipt token or ownership. */
export async function getReceipt(
  id: string,
  auth: BurnAuthorization,
  clock: Clock = systemClock,
): Promise<ReceiptView> {
  const db = await getDb();
  const [row] = await db.select().from(secrets).where(eq(secrets.id, id)).limit(1);
  if (!row || !isAuthorizedToManage(row, auth))
    throw new AppError("not_found", "Secret not found.");
  return toReceipt(row, clock());
}

export function toReceipt(row: typeof secrets.$inferSelect, now: Date): ReceiptView {
  const state: PublicSecretState =
    row.state === "active" && row.expiresAt <= now ? "expired" : row.state;
  return {
    id: row.id,
    state,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    maxViews: row.maxViews,
    viewCount: row.viewCount,
    hasPassphrase: row.kdf !== null,
    label: row.label,
    consumedAt: row.consumedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Cleanup: transitions overdue active secrets to `expired` and destroys their payloads, in bounded
 * batches. The UPDATE is guarded by `state = 'active'`, so it can never touch consumed/revoked rows.
 */
export async function expireDueSecrets(
  opts: { batchSize?: number; clock?: Clock } = {},
): Promise<{ expired: number }> {
  const db = await getDb();
  const now = (opts.clock ?? systemClock)();
  const batchSize = opts.batchSize ?? 500;
  let total = 0;
  for (;;) {
    const batch = await db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(secrets)
        .where(and(eq(secrets.state, "active"), lte(secrets.expiresAt, now)))
        .limit(batchSize)
        .for("update", { skipLocked: true });
      for (const row of due) {
        const changed = await transitionOut(tx, row.id, { state: "expired", expiredAt: now });
        if (changed)
          await emitSecretEvent(
            tx,
            { userId: row.ownerUserId, organizationId: row.organizationId },
            "secret.expired",
            eventData({ ...row, state: "expired" }),
            now,
          );
      }
      return due.length;
    });
    total += batch;
    if (batch < batchSize) break;
  }
  return { expired: total };
}

/**
 * Retention: deletes metadata rows for secrets that reached a terminal state long ago. Anonymous
 * secrets keep metadata for 24 hours (so receipt pages can show "opened"); owned secrets for 30 days.
 */
export async function purgeTerminalMetadata(
  opts: { clock?: Clock } = {},
): Promise<{ purged: number }> {
  const db = await getDb();
  const now = (opts.clock ?? systemClock)();
  const anonCutoff = new Date(now.getTime() - 24 * 3600 * 1000);
  const ownedCutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const terminalAt = sql`coalesce(${secrets.consumedAt}, ${secrets.revokedAt}, ${secrets.expiredAt}, ${secrets.expiresAt})`;
  const deleted = await db
    .delete(secrets)
    .where(
      and(
        sql`${secrets.state} <> 'active'`,
        sql`((${secrets.ownerUserId} IS NULL AND ${terminalAt} < ${anonCutoff}) OR (${secrets.ownerUserId} IS NOT NULL AND ${terminalAt} < ${ownedCutoff}))`,
      ),
    )
    .returning({ id: secrets.id });
  return { purged: deleted.length };
}
