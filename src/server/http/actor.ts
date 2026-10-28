import "server-only";
import { eq } from "drizzle-orm";
import type { Plan } from "@/config/plans";
import { type ApiScope, authenticateApiKey } from "@/server/apikeys";
import { getAuth } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { member } from "@/server/db/schema";
import { planFor } from "@/server/entitlements";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";

export type Actor =
  | { kind: "anonymous"; ip: string }
  | {
      kind: "user";
      ip: string;
      userId: string;
      role: string | null;
      organizationId: string | null;
      organizationIds: string[];
      plan: Plan;
    }
  | {
      kind: "apiKey";
      ip: string;
      keyId: string;
      userId: string;
      organizationId: string | null;
      organizationIds: string[];
      scopes: string[];
      environment: "live" | "test";
      plan: Plan;
    };

/**
 * Client IP for rate limiting. Next.js route handlers do not expose the socket address, so we rely
 * on the reverse proxy. With TRUST_PROXY, the right-most X-Forwarded-For entry (added by our proxy)
 * is used; spoofable left-most entries are ignored.
 */
export function clientIp(headers: Headers): string {
  if (!env().TRUST_PROXY) return "untrusted-proxy";
  const xff = headers.get("x-forwarded-for");
  const ip =
    xff
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1) ?? headers.get("x-real-ip");
  return ip ?? "unknown";
}

async function organizationIdsFor(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  return rows.map((r) => r.id);
}

/** Identifies the caller: API key (Bearer), browser session (cookie), or anonymous. */
export async function resolveActor(req: Request): Promise<Actor> {
  const ip = clientIp(req.headers);
  const authorization = req.headers.get("authorization");

  if (authorization) {
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token)
      throw new AppError("unauthorized", "Use 'Authorization: Bearer <api key>'.");
    const key = await authenticateApiKey(token);
    if (!key) throw new AppError("unauthorized", "Invalid, expired or revoked API key.");
    const plan = await planFor({ userId: key.userId, organizationId: key.organizationId });
    if (!plan.limits.apiAccess)
      throw new AppError("plan_restricted", "API access requires the Pro plan or higher.");
    return {
      kind: "apiKey",
      ip,
      keyId: key.id,
      userId: key.userId,
      organizationId: key.organizationId,
      organizationIds: await organizationIdsFor(key.userId),
      scopes: key.scopes,
      environment: key.environment,
      plan,
    };
  }

  const session = await getAuth().api.getSession({ headers: req.headers });
  if (session && !session.user.banned) {
    const organizationId =
      (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
    const organizationIds = await organizationIdsFor(session.user.id);
    const activeOrg =
      organizationId && organizationIds.includes(organizationId) ? organizationId : null;
    return {
      kind: "user",
      ip,
      userId: session.user.id,
      role: (session.user as { role?: string | null }).role ?? null,
      organizationId: activeOrg,
      organizationIds,
      plan: await planFor({ userId: session.user.id, organizationId: activeOrg }),
    };
  }
  return { kind: "anonymous", ip };
}

export function requireScope(actor: Actor, scope: ApiScope): void {
  if (actor.kind === "apiKey" && !actor.scopes.includes(scope)) {
    throw new AppError("forbidden", `This API key is missing the '${scope}' scope.`);
  }
}

export function requireAccount(
  actor: Actor,
): asserts actor is Exclude<Actor, { kind: "anonymous" }> {
  if (actor.kind === "anonymous") throw new AppError("unauthorized", "Sign in or use an API key.");
}

export function requireSession(actor: Actor): asserts actor is Extract<Actor, { kind: "user" }> {
  if (actor.kind !== "user")
    throw new AppError("unauthorized", "This endpoint requires a signed-in session.");
}
