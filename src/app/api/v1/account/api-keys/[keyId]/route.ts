import { revokeApiKey } from "@/server/apikeys";
import { requireSession, resolveActor } from "@/server/http/actor";
import { assertSameOrigin, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

export const DELETE = route<{ keyId: string }>(async ({ req, params }) => {
  assertSameOrigin(req);
  const actor = await resolveActor(req);
  requireSession(actor);
  await revokeApiKey(actor.userId, params.keyId);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
