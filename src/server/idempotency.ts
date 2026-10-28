import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { sha256 } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { idempotencyKeys } from "@/server/db/schema";
import { AppError } from "@/server/errors";

const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;
export const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

/**
 * Runs `fn` at most once per (scope, key). Retries with the same key and body replay the stored
 * response; the same key with a different body is rejected. Failed attempts release the key.
 * Stored responses must not contain key material (callers store ids/timestamps only).
 */
export async function withIdempotency<T extends Record<string, unknown>>(
  scope: string,
  key: string | null,
  bodyFingerprint: string,
  fn: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T; replayed: boolean }> {
  if (!key) return { ...(await fn()), replayed: false };
  if (!KEY_RE.test(key))
    throw new AppError(
      "bad_request",
      "Idempotency-Key must be 8–128 characters of [A-Za-z0-9_.:-].",
    );

  const db = await getDb();
  const requestHash = sha256(bodyFingerprint);
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ scope, key, requestHash })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (inserted.length === 0) {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
      .limit(1);
    if (!existing)
      throw new AppError("conflict", "Idempotency key state changed; retry the request.");
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        "idempotency_mismatch",
        "This Idempotency-Key was already used with a different request body.",
      );
    }
    if (existing.responseStatus === null)
      throw new AppError("conflict", "A request with this Idempotency-Key is still in progress.");
    return { status: existing.responseStatus, body: existing.responseBody as T, replayed: true };
  }

  try {
    const result = await fn();
    await db
      .update(idempotencyKeys)
      .set({ responseStatus: result.status, responseBody: result.body })
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    return { ...result, replayed: false };
  } catch (error) {
    await db
      .delete(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    throw error;
  }
}

export async function purgeIdempotencyKeys(now = new Date()): Promise<number> {
  const db = await getDb();
  const rows = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, new Date(now.getTime() - IDEMPOTENCY_TTL_MS)))
    .returning({ key: idempotencyKeys.key });
  return rows.length;
}
