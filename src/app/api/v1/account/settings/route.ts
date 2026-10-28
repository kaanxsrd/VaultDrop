import { getSettings, updateSettings } from "@/server/account";
import { requireSession, resolveActor } from "@/server/http/actor";
import { assertSameOrigin, json, readJson, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

export const GET = route(async ({ req }) => {
  const actor = await resolveActor(req);
  requireSession(actor);
  return json(await getSettings(actor.userId));
});

export const PATCH = route(async ({ req }) => {
  assertSameOrigin(req);
  const actor = await resolveActor(req);
  requireSession(actor);
  return json(await updateSettings(actor.userId, await readJson(req, 2048)));
});
