import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";

/** Current session for Server Components (deduplicated per request). */
export const getSession = cache(async () => {
  await getDb();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || session.user.banned) return null;
  return session;
});

export async function requireUser(returnTo = "/dashboard") {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return session;
}

export async function requireAdmin() {
  const session = await requireUser("/admin");
  if ((session.user as { role?: string | null }).role !== "admin") redirect("/dashboard");
  return session;
}
