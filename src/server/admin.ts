import "server-only";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { PLANS, type PlanId } from "@/config/plans";
import { newId } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import {
  auditEvents,
  organization,
  rateLimits,
  secrets,
  session,
  subscriptions,
  user,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { audit } from "@/server/events";

/**
 * Administrative queries. Deliberately limited to aggregates and account metadata: there is no
 * function here (or anywhere) that returns ciphertext, and destroyed secrets cannot be restored.
 */

export async function platformStats() {
  const db = await getDb();
  const [secretRows, [users], [orgs], [sessions]] = await Promise.all([
    db
      .select({ state: secrets.state, count: sql<number>`count(*)::int` })
      .from(secrets)
      .groupBy(secrets.state),
    db.select({ count: sql<number>`count(*)::int` }).from(user),
    db.select({ count: sql<number>`count(*)::int` }).from(organization),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(session)
      .where(sql`${session.expiresAt} > now()`),
  ]);
  const created24h = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(secrets)
    .where(sql`${secrets.createdAt} > now() - interval '24 hours'`);
  return {
    secrets: Object.fromEntries(secretRows.map((r) => [r.state, r.count])) as Record<
      string,
      number
    >,
    created24h: created24h[0]?.count ?? 0,
    users: users?.count ?? 0,
    organizations: orgs?.count ?? 0,
    activeSessions: sessions?.count ?? 0,
  };
}

export async function searchUsers(q: string, limit = 50) {
  const db = await getDb();
  const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
    })
    .from(user)
    .leftJoin(subscriptions, eq(subscriptions.subject, sql`'user:' || ${user.id}`))
    .where(q ? or(ilike(user.email, term), ilike(user.name, term)) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(limit);
  return rows;
}

/** Manual plan assignment for self-hosted deployments without Stripe (or support overrides). */
export async function setUserPlan(adminId: string, userId: string, plan: PlanId) {
  if (!(plan in PLANS) || plan === "anonymous")
    throw new AppError("validation_failed", "Unknown plan.");
  const db = await getDb();
  const subject = `user:${userId}`;
  if (plan === "free") await db.delete(subscriptions).where(eq(subscriptions.subject, subject));
  else
    await db
      .insert(subscriptions)
      .values({ id: newId("sub"), subject, plan, status: "active" })
      .onConflictDoUpdate({
        target: subscriptions.subject,
        set: { plan, status: "active", updatedAt: new Date() },
      });
  await audit(db, {
    userId: adminId,
    action: "admin.plan_set",
    targetType: "user",
    targetId: userId,
    metadata: { plan },
  });
}

export async function setUserBanned(adminId: string, userId: string, banned: boolean) {
  if (adminId === userId) throw new AppError("forbidden", "You cannot ban yourself.");
  const db = await getDb();
  await db
    .update(user)
    .set({ banned, banReason: banned ? "Suspended by administrator" : null })
    .where(eq(user.id, userId));
  if (banned) await db.delete(session).where(eq(session.userId, userId));
  await audit(db, {
    userId: adminId,
    action: banned ? "admin.user_banned" : "admin.user_unbanned",
    targetType: "user",
    targetId: userId,
  });
}

export async function recentAudit(limit = 50) {
  const db = await getDb();
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
}

/** Hot rate-limit buckets in the current window (keys are pseudonymous; only bucket names are shown). */
export async function rateLimitPressure() {
  const db = await getDb();
  return db
    .select({
      bucket: sql<string>`split_part(${rateLimits.key}, ':', 1) || ':' || split_part(${rateLimits.key}, ':', 2) || ':' || split_part(${rateLimits.key}, ':', 3)`,
      clients: sql<number>`count(*)::int`,
      maxCount: sql<number>`max(${rateLimits.count})::int`,
    })
    .from(rateLimits)
    .where(sql`${rateLimits.expiresAt} > now()`)
    .groupBy(sql`1`)
    .orderBy(sql`3 desc`)
    .limit(20);
}
