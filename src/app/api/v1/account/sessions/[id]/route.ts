import { revokeSession } from "@/server/account";
import { getAuth } from "@/server/auth/auth";
import { AppError } from "@/server/errors";
import { assertSameOrigin, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

export const DELETE = route<{ id: string }>(async ({ req, params }) => {
  assertSameOrigin(req);
  const s = await getAuth().api.getSession({ headers: req.headers });
  if (!s) throw new AppError("unauthorized", "Sign in required.");
  await revokeSession(s.user.id, params.id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
