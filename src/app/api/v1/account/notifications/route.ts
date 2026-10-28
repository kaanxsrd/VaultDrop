import { listNotifications, markAllNotificationsRead } from "@/server/account";
import { requireSession, resolveActor } from "@/server/http/actor";
import { assertSameOrigin, json, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

export const GET = route(async ({ req }) => {
  const actor = await resolveActor(req);
  requireSession(actor);
  return json({ items: await listNotifications(actor.userId) });
});

/** Marks all notifications as read. */
export const POST = route(async ({ req }) => {
  assertSameOrigin(req);
  const actor = await resolveActor(req);
  requireSession(actor);
  await markAllNotificationsRead(actor.userId);
  return json({ ok: true });
});
