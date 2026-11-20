import "server-only";
import { AppError } from "@/server/errors";
import { gw } from "@/server/groundwork";

const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

/**
 * Runs `fn` at most once per (scope, key) for 24 hours. Retries with the same key and body replay
 * the stored response; the same key with a different body is rejected. Failed attempts release
 * the key. groundwork stores the key, scope and body fingerprint as HMACs; the stored response
 * must not contain key material (callers store ids and timestamps only, and derive the rest).
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

  const result = await (await gw()).idempotency.run(
    { scope, key, fingerprint: bodyFingerprint },
    fn,
  );
  if (!result.ok) {
    if (result.reason === "mismatch") {
      throw new AppError(
        "idempotency_mismatch",
        "This Idempotency-Key was already used with a different request body.",
      );
    }
    throw new AppError("conflict", "A request with this Idempotency-Key is still in progress.");
  }
  // The stored JSON: the body holds only strings and numbers, so it reads back unchanged.
  // groundwork types it as Jsonify<…>, which TypeScript can't resolve for a generic T.
  const stored = result.value as unknown as { status: number; body: T };
  return { ...stored, replayed: result.replayed };
}

/** Deletes expired keys; returns how many. */
export async function purgeIdempotencyKeys(): Promise<number> {
  return (await gw()).idempotency.cleanup();
}
