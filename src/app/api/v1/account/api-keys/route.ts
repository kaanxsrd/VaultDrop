import { createApiKey, listApiKeys } from "@/server/apikeys";
import { requireSession, resolveActor } from "@/server/http/actor";
import { assertSameOrigin, json, readJson, route } from "@/server/http/route";
import { enforceRateLimit, RULES } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/** API keys are managed with a browser session only; an API key cannot mint other keys. */
export const GET = route(async ({ req }) => {
  const actor = await resolveActor(req);
  requireSession(actor);
  return json({ items: await listApiKeys(actor.userId) });
});

export const POST = route(async ({ req }) => {
  assertSameOrigin(req);
  const actor = await resolveActor(req);
  requireSession(actor);
  await enforceRateLimit(RULES.accountApi, `user:${actor.userId}`);
  const result = await createApiKey(
    actor.userId,
    actor.plan,
    await readJson(req, 4096),
    actor.organizationId,
  );
  return json(result, { status: 201 });
});
