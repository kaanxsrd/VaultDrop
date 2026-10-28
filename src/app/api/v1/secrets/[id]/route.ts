import { secretIdSchema } from "@/lib/validation/secrets";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/http/actor";
import { manageAuthorization } from "@/server/http/manage";
import { json, route } from "@/server/http/route";
import { enforceRateLimit, RULES } from "@/server/ratelimit";
import { getReceipt } from "@/server/secrets/service";

export const dynamic = "force-dynamic";

/** Creator-facing metadata ("receipt"). Never includes ciphertext. */
export const GET = route<{ id: string }>(async ({ req, params }) => {
  await enforceRateLimit(RULES.receipt, clientIp(req.headers));
  if (!secretIdSchema.safeParse(params.id).success)
    throw new AppError("not_found", "Secret not found.");
  const authz = await manageAuthorization(req, "secrets:read");
  return json(await getReceipt(params.id, authz));
});
