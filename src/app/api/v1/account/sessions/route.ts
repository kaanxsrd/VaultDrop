import { listSessions, revokeOtherSessions } from "@/server/account";
import { getAuth } from "@/server/auth/auth";
import { AppError } from "@/server/errors";
import { assertSameOrigin, json, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

async function currentSession(req: Request) {
  const s = await getAuth().api.getSession({ headers: req.headers });
  if (!s) throw new AppError("unauthorized", "Sign in required.");
  return s;
}

export const GET = route(async ({ req }) => {
  const s = await currentSession(req);
  return json({ items: await listSessions(s.user.id, s.session.token) });
});

/** Signs out every other device. */
export const POST = route(async ({ req }) => {
  assertSameOrigin(req);
  const s = await currentSession(req);
  return json({ revoked: await revokeOtherSessions(s.user.id, s.session.id) });
});
