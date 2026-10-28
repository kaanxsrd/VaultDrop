import { secretIdSchema } from "@/lib/validation/secrets";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/http/actor";
import { manageAuthorization } from "@/server/http/manage";
import { assertSameOrigin, json, route } from "@/server/http/route";
import { deliverWebhooksAfterResponse } from "@/server/jobs/runner";
import { enforceRateLimit, RULES } from "@/server/ratelimit";
import { burnSecret } from "@/server/secrets/service";

export const dynamic = "force-dynamic";

/** Destroys an active secret before it is read. Authorized by receipt token, owner session or API key. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  assertSameOrigin(req);
  await enforceRateLimit(RULES.burn, clientIp(req.headers));
  if (!secretIdSchema.safeParse(params.id).success)
    throw new AppError("not_found", "Secret not found.");
  const authz = await manageAuthorization(req, "secrets:burn");
  const outcome = await burnSecret(params.id, authz);
  deliverWebhooksAfterResponse();
  return json(outcome);
});
