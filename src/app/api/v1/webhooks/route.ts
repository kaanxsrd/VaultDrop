import { requireAccount, requireScope, resolveActor } from "@/server/http/actor";
import { assertSameOrigin, json, readJson, route } from "@/server/http/route";
import { enforceRateLimit, RULES } from "@/server/ratelimit";
import { createWebhookEndpoint, listWebhookEndpoints, recentDeliveries } from "@/server/webhooks";

export const dynamic = "force-dynamic";

export const GET = route(async ({ req }) => {
  const actor = await resolveActor(req);
  requireAccount(actor);
  requireScope(actor, "webhooks:manage");
  const [items, deliveries] = await Promise.all([
    listWebhookEndpoints(actor.userId),
    recentDeliveries(actor.userId),
  ]);
  return json({ items, deliveries });
});

/** Creates an endpoint. The signing secret is returned once and stored encrypted. */
export const POST = route(async ({ req }) => {
  assertSameOrigin(req);
  const actor = await resolveActor(req);
  requireAccount(actor);
  requireScope(actor, "webhooks:manage");
  await enforceRateLimit(RULES.accountApi, `user:${actor.userId}`);
  const result = await createWebhookEndpoint(
    actor.userId,
    actor.plan,
    await readJson(req, 8192),
    actor.organizationId,
  );
  return json(result, { status: 201 });
});
