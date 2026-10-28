import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { PLANS, type Plan, type PlanId } from "@/config/plans";
import { type Database, getDb, type Transaction } from "@/server/db/client";
import { subscriptions, usageCounters } from "@/server/db/schema";
import { AppError } from "@/server/errors";

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Resolves the effective plan for a user (or their active organization). Server-side only. */
export async function planFor(subject: {
  userId?: string | null;
  organizationId?: string | null;
}): Promise<Plan> {
  if (!subject.userId && !subject.organizationId) return PLANS.anonymous;
  const db = await getDb();
  const keys = [
    subject.organizationId ? `org:${subject.organizationId}` : null,
    subject.userId ? `user:${subject.userId}` : null,
  ].filter((k): k is string => k !== null);
  for (const key of keys) {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.subject, key))
      .limit(1);
    if (row && ACTIVE_STATUSES.has(row.status) && row.plan in PLANS)
      return PLANS[row.plan as PlanId];
  }
  return PLANS.free;
}

export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Atomically increments a monthly usage counter and enforces the plan quota in the same statement,
 * so concurrent requests cannot overshoot the limit.
 */
export async function consumeQuota(
  db: Database | Transaction,
  subject: string,
  metric: string,
  limit: number | null,
  now = new Date(),
): Promise<number> {
  const period = currentPeriod(now);
  const rows = await db
    .insert(usageCounters)
    .values({ subject, period, metric, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.subject, usageCounters.period, usageCounters.metric],
      set: { count: sql`${usageCounters.count} + 1` },
      setWhere: limit === null ? undefined : sql`${usageCounters.count} < ${limit}`,
    })
    .returning({ count: usageCounters.count });
  if (rows.length === 0) {
    throw new AppError("quota_exceeded", `Monthly limit of ${limit} reached for this plan.`, {
      metric,
      limit,
    });
  }
  return rows[0]!.count;
}

export async function usageFor(subject: string, now = new Date()): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ metric: usageCounters.metric, count: usageCounters.count })
    .from(usageCounters)
    .where(and(eq(usageCounters.subject, subject), eq(usageCounters.period, currentPeriod(now))));
  return Object.fromEntries(rows.map((r) => [r.metric, r.count]));
}
