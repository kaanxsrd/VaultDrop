import "server-only";
import type { ApiScope } from "@/server/apikeys";
import { AppError } from "@/server/errors";
import type { BurnAuthorization } from "@/server/secrets/service";
import { requireScope, resolveActor } from "./actor";

/**
 * Who may manage (view receipt / burn) a secret: holders of its receipt token, its owner, members
 * of its owning organization, or an API key belonging to those with the right scope.
 */
export async function manageAuthorization(
  req: Request,
  scope: ApiScope,
): Promise<BurnAuthorization> {
  const receipt = req.headers.get("x-receipt-token");
  if (receipt) return { kind: "receipt", token: receipt };
  const actor = await resolveActor(req);
  if (actor.kind === "anonymous")
    throw new AppError("unauthorized", "Provide X-Receipt-Token, a session or an API key.");
  requireScope(actor, scope);
  return { kind: "owner", userId: actor.userId, organizationIds: actor.organizationIds };
}
