import { redeemSecretSchema, secretIdSchema } from "@/lib/validation/secrets";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/http/actor";
import { json, readJson, route } from "@/server/http/route";
import { deliverWebhooksAfterResponse } from "@/server/jobs/runner";
import { enforceRateLimit, RULES } from "@/server/ratelimit";
import { redeemSecret } from "@/server/secrets/service";

export const dynamic = "force-dynamic";

/**
 * Redeems a secret: verifies the client's proof of the link key (and passphrase) and, if valid,
 * atomically consumes one view and returns the encrypted envelope. A wrong proof never consumes.
 * Anyone holding a valid link may redeem, so this endpoint accepts no cookies-based authority and
 * needs no CSRF protection.
 */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const ip = clientIp(req.headers);
  await enforceRateLimit(RULES.redeemIp, ip);
  if (!secretIdSchema.safeParse(params.id).success)
    throw new AppError("not_found", "This secret does not exist or has been deleted.");
  await enforceRateLimit(RULES.redeemSecret, `secret:${params.id}`);

  const parsed = redeemSecretSchema.safeParse(await readJson(req, 4096));
  if (!parsed.success) throw new AppError("validation_failed", "A valid proof is required.");

  const result = await redeemSecret(params.id, parsed.data.proof);
  // Consumed, viewed, expired and lock-out transitions can all queue webhook events.
  deliverWebhooksAfterResponse();
  if (result.ok) return json({ envelope: result.envelope, viewsRemaining: result.viewsRemaining });

  switch (result.reason) {
    case "not_found":
      throw new AppError("not_found", "This secret does not exist or has been deleted.");
    case "invalid_proof":
      throw new AppError(
        "invalid_proof",
        "Incorrect passphrase or link. The secret was not opened.",
        { attemptsRemaining: result.attemptsRemaining },
      );
    case "locked":
      throw new AppError(
        "secret_unavailable",
        "Too many incorrect attempts. The secret has been destroyed.",
        { state: "revoked", reason: "attempts_exceeded" },
      );
    default:
      throw new AppError("secret_unavailable", unavailableMessage(result.reason), {
        state: result.reason,
      });
  }
});

function unavailableMessage(state: "consumed" | "expired" | "revoked"): string {
  return {
    consumed: "This secret has already been viewed and no longer exists.",
    expired: "This secret expired before it was viewed and has been deleted.",
    revoked: "The sender destroyed this secret before it was viewed.",
  }[state];
}
