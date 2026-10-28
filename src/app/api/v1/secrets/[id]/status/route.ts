import { secretIdSchema } from "@/lib/validation/secrets";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/http/actor";
import { json, route } from "@/server/http/route";
import { enforceRateLimit, RULES } from "@/server/ratelimit";
import { getSecretStatus } from "@/server/secrets/service";

export const dynamic = "force-dynamic";

/** Pre-redemption status for recipients. Does not consume the secret. */
export const GET = route<{ id: string }>(async ({ req, params }) => {
  await enforceRateLimit(RULES.status, clientIp(req.headers));
  if (!secretIdSchema.safeParse(params.id).success)
    throw new AppError("not_found", "This secret does not exist or has been deleted.");
  const status = await getSecretStatus(params.id);
  if (!status) throw new AppError("not_found", "This secret does not exist or has been deleted.");
  return json(status);
});
