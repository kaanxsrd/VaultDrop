import { requireAccount, requireScope, resolveActor } from "@/server/http/actor";
import { assertSameOrigin, route } from "@/server/http/route";
import { deleteWebhookEndpoint } from "@/server/webhooks";

export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>(async ({ req, params }) => {
  assertSameOrigin(req);
  const actor = await resolveActor(req);
  requireAccount(actor);
  requireScope(actor, "webhooks:manage");
  await deleteWebhookEndpoint(actor.userId, params.id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
