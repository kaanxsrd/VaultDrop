import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PLANS } from "@/config/plans";
import { deriveKeys, openEnvelope, sealSecret, unsealSecret } from "@/lib/crypto/envelope";
import { closeDb, getDb } from "@/server/db/client";
import { secretPayloads, secrets } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import {
  burnSecret,
  createSecret,
  expireDueSecrets,
  getReceipt,
  getSecretStatus,
  purgeTerminalMetadata,
  redeemSecret,
} from "@/server/secrets/service";
import { anonymousOwner, makeSecret } from "../support/factories";

afterAll(async () => {
  await closeDb();
});

const later = (ms: number) => () => new Date(Date.now() + ms);

describe("secret creation", () => {
  it("stores only ciphertext and metadata, never the key", async () => {
    const s = await makeSecret("top secret");
    const db = await getDb();
    const [row] = await db.select().from(secrets).where(eq(secrets.id, s.id));
    const [payload] = await db
      .select()
      .from(secretPayloads)
      .where(eq(secretPayloads.secretId, s.id));
    expect(row?.state).toBe("active");
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const stored = JSON.stringify({ row, payload });
    expect(stored).not.toContain("top secret");
    expect(stored).not.toContain(s.sealed.linkKey);
    expect(stored).not.toContain(s.proof);
  });

  it("enforces plan limits server-side", async () => {
    const sealed = await sealSecret("x");
    const base = { envelope: sealed.envelope, kdf: null, verifier: sealed.verifier };
    const ctx = { owner: anonymousOwner, plan: PLANS.anonymous };
    await expect(createSecret({ ...base, expiresIn: 30 * 86400 }, ctx)).rejects.toMatchObject({
      code: "plan_restricted",
    });
    await expect(
      createSecret({ ...base, expiresIn: 3600, maxViews: 3 }, ctx),
    ).rejects.toMatchObject({ code: "plan_restricted" });
    await expect(
      createSecret({ ...base, expiresIn: 3600, label: "db creds" }, ctx),
    ).rejects.toMatchObject({ code: "plan_restricted" });
    await expect(createSecret({ ...base, expiresIn: 10 }, ctx)).rejects.toMatchObject({
      code: "validation_failed",
    });
    const big = await sealSecret("x".repeat(20_000));
    await expect(
      createSecret(
        { envelope: big.envelope, kdf: null, verifier: big.verifier, expiresIn: 3600 },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "payload_too_large" });
  });

  it("rejects malformed envelopes and abusive KDF parameters", async () => {
    const sealed = await sealSecret("x", { passphrase: "pw" });
    const ctx = { owner: anonymousOwner, plan: PLANS.anonymous };
    await expect(
      createSecret(
        {
          envelope: { ...sealed.envelope, iv: "not base64!" },
          kdf: sealed.kdf,
          verifier: sealed.verifier,
          expiresIn: 3600,
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      createSecret(
        {
          envelope: sealed.envelope,
          kdf: { ...sealed.kdf!, m: 4_000_000 },
          verifier: sealed.verifier,
          expiresIn: 3600,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
});

describe("redemption", () => {
  it("releases the envelope once and the recipient can decrypt it", async () => {
    const s = await makeSecret("hello recipient");
    const status = await getSecretStatus(s.id);
    expect(status).toMatchObject({ state: "active", requiresPassphrase: false, viewsRemaining: 1 });

    const result = await redeemSecret(s.id, s.proof);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await unsealSecret(result.envelope, s.sealed.linkKey, null)).toBe("hello recipient");

    const again = await redeemSecret(s.id, s.proof);
    expect(again).toEqual({ ok: false, reason: "consumed" });
    expect(await getSecretStatus(s.id)).toMatchObject({
      state: "consumed",
      kdf: null,
      viewsRemaining: 0,
    });

    const db = await getDb();
    expect(
      await db.select().from(secretPayloads).where(eq(secretPayloads.secretId, s.id)),
    ).toHaveLength(0);
  });

  it("returns not_found for unknown identifiers", async () => {
    expect(await redeemSecret("A".repeat(22), "B".repeat(43))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await getSecretStatus("A".repeat(22))).toBeNull();
  });

  it("allows exactly one successful redemption under 25 concurrent requests", async () => {
    const s = await makeSecret("race me");
    const results = await Promise.all(
      Array.from({ length: 25 }, () => redeemSecret(s.id, s.proof)),
    );
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "consumed")).toHaveLength(24);
  });

  it("serves exactly maxViews redemptions for multi-view secrets under concurrency", async () => {
    const s = await makeSecret("shared with 3", { maxViews: 3 });
    const results = await Promise.all(
      Array.from({ length: 12 }, () => redeemSecret(s.id, s.proof)),
    );
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(3);
    expect(ok.map((r) => (r.ok ? r.viewsRemaining : -1)).sort()).toEqual([0, 1, 2]);
    expect((await getSecretStatus(s.id))?.state).toBe("consumed");
  });
});

describe("passphrase protection", () => {
  it("does not consume the secret on a wrong passphrase and then succeeds with the right one", async () => {
    const s = await makeSecret("guarded", { passphrase: "open sesame" });
    const status = await getSecretStatus(s.id);
    expect(status?.requiresPassphrase).toBe(true);
    expect(status?.kdf?.alg).toBe("argon2id");

    const wrong = await deriveKeys(s.sealed.linkKey, status!.kdf, "open sesame!");
    const first = await redeemSecret(s.id, wrong.authProof);
    expect(first).toEqual({ ok: false, reason: "invalid_proof", attemptsRemaining: 9 });
    expect((await getSecretStatus(s.id))?.state).toBe("active");

    const right = await deriveKeys(s.sealed.linkKey, status!.kdf, "open sesame");
    const result = await redeemSecret(s.id, right.authProof);
    expect(result.ok).toBe(true);
    if (result.ok) expect(await openEnvelope(result.envelope, right.encKey)).toBe("guarded");
  });

  it("destroys the secret after the configured number of failed attempts", async () => {
    const s = await makeSecret("brute force target", { passphrase: "pw", maxFailedAttempts: 3 });
    const status = await getSecretStatus(s.id);
    const bad = await deriveKeys(s.sealed.linkKey, status!.kdf, "nope");
    expect(await redeemSecret(s.id, bad.authProof)).toMatchObject({
      reason: "invalid_proof",
      attemptsRemaining: 2,
    });
    expect(await redeemSecret(s.id, bad.authProof)).toMatchObject({
      reason: "invalid_proof",
      attemptsRemaining: 1,
    });
    expect(await redeemSecret(s.id, bad.authProof)).toEqual({ ok: false, reason: "locked" });
    expect(await redeemSecret(s.id, s.proof)).toEqual({ ok: false, reason: "revoked" });
    const db = await getDb();
    expect(
      await db.select().from(secretPayloads).where(eq(secretPayloads.secretId, s.id)),
    ).toHaveLength(0);
  });

  it("requires proof of the link key even without a passphrase (an id alone cannot burn a secret)", async () => {
    const s = await makeSecret("needs link");
    const result = await redeemSecret(s.id, "A".repeat(43));
    expect(result).toMatchObject({ ok: false, reason: "invalid_proof" });
    expect((await redeemSecret(s.id, s.proof)).ok).toBe(true);
  });
});

describe("expiration", () => {
  it("is enforced at redemption even before the cleanup job runs", async () => {
    const s = await makeSecret("short lived", { expiresIn: 60 });
    expect((await getSecretStatus(s.id, later(61_000)))?.state).toBe("expired");
    expect(await redeemSecret(s.id, s.proof, later(61_000))).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await redeemSecret(s.id, s.proof)).toEqual({ ok: false, reason: "expired" });
  });

  it("cleanup expires due secrets, deletes payloads, and never reactivates terminal secrets", async () => {
    const due = await makeSecret("due", { expiresIn: 60 });
    const consumed = await makeSecret("consumed", { expiresIn: 60 });
    const revoked = await makeSecret("revoked", { expiresIn: 60 });
    const fresh = await makeSecret("fresh", { expiresIn: 7200 });
    expect((await redeemSecret(consumed.id, consumed.proof)).ok).toBe(true);
    await burnSecret(revoked.id, { kind: "receipt", token: revoked.receiptToken });

    const { expired } = await expireDueSecrets({ clock: later(120_000) });
    expect(expired).toBeGreaterThanOrEqual(1);

    expect((await getSecretStatus(due.id))?.state).toBe("expired");
    expect((await getSecretStatus(consumed.id))?.state).toBe("consumed");
    expect((await getSecretStatus(revoked.id))?.state).toBe("revoked");
    expect((await getSecretStatus(fresh.id))?.state).toBe("active");

    const db = await getDb();
    expect(
      await db.select().from(secretPayloads).where(eq(secretPayloads.secretId, due.id)),
    ).toHaveLength(0);
    // Running again is a no-op for already-terminal secrets.
    await expireDueSecrets({ clock: later(120_000) });
    expect((await getSecretStatus(consumed.id))?.state).toBe("consumed");
  });

  it("purges terminal metadata after the retention window", async () => {
    const s = await makeSecret("purge me");
    await redeemSecret(s.id, s.proof);
    await purgeTerminalMetadata({ clock: later(25 * 3600 * 1000) });
    expect(await getSecretStatus(s.id)).toBeNull();
  });
});

describe("revocation", () => {
  it("lets the creator burn a secret with the receipt token, and blocks redemption afterwards", async () => {
    const s = await makeSecret("burn me");
    await expect(burnSecret(s.id, { kind: "receipt", token: "wrong-token" })).rejects.toMatchObject(
      { code: "not_found" },
    );
    expect(await burnSecret(s.id, { kind: "receipt", token: s.receiptToken })).toEqual({
      state: "revoked",
    });
    expect(await redeemSecret(s.id, s.proof)).toEqual({ ok: false, reason: "revoked" });
    expect(await burnSecret(s.id, { kind: "receipt", token: s.receiptToken })).toEqual({
      state: "revoked",
    });
  });

  it("does not let one owner manage another owner's secret", async () => {
    const db = await getDb();
    const { user } = await import("@/server/db/schema");
    await db.insert(user).values([
      { id: "u_alice", name: "Alice", email: "alice@example.test", updatedAt: new Date() },
      { id: "u_bob", name: "Bob", email: "bob@example.test", updatedAt: new Date() },
    ]);
    const s = await makeSecret("alice only", {
      owner: { userId: "u_alice", organizationId: null, apiKeyId: null, environment: "live" },
    });
    await expect(getReceipt(s.id, { kind: "owner", userId: "u_bob" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(burnSecret(s.id, { kind: "owner", userId: "u_bob" })).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await getReceipt(s.id, { kind: "owner", userId: "u_alice" })).state).toBe("active");
    expect(await burnSecret(s.id, { kind: "owner", userId: "u_alice" })).toEqual({
      state: "revoked",
    });
  });
});

describe("failure handling", () => {
  it("rolls back and keeps the secret redeemable when the database fails mid-redemption", async () => {
    const s = await makeSecret("survives failures");
    const db = await getDb();
    const original = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementationOnce(async (fn) =>
      original(async (tx) => {
        await fn(tx);
        throw new Error("simulated connection loss before commit");
      }),
    );
    await expect(redeemSecret(s.id, s.proof)).rejects.toThrow("simulated connection loss");
    spy.mockRestore();

    expect((await getSecretStatus(s.id))?.state).toBe("active");
    const ok = await redeemSecret(s.id, s.proof);
    expect(ok.ok).toBe(true);
    expect((await redeemSecret(s.id, s.proof)).ok).toBe(false);
  });
});
