import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { secrets } from "@/server/db/schema";
import { type ReceiptView, toReceipt } from "./service";

export const listSecretsSchema = z.object({
  state: z.enum(["all", "active", "consumed", "expired", "revoked"]).default("all"),
  q: z.string().trim().max(80).optional(),
  sort: z
    .enum(["created_desc", "created_asc", "expires_asc", "expires_desc"])
    .default("created_desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  environment: z.enum(["live", "test"]).optional(),
});
export type ListSecretsQuery = z.infer<typeof listSecretsSchema>;

export interface SecretScope {
  userId: string;
  /** When set, list the organization's secrets instead of personal ones. */
  organizationId: string | null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Metadata-only listing for dashboards. Search covers the creator's non-sensitive label only. */
export async function listSecrets(
  scope: SecretScope,
  query: ListSecretsQuery,
  now = new Date(),
): Promise<{ items: ReceiptView[]; total: number; page: number; pageSize: number }> {
  const db = await getDb();
  const filters: SQL[] = [
    scope.organizationId
      ? eq(secrets.organizationId, scope.organizationId)
      : and(eq(secrets.ownerUserId, scope.userId), isNull(secrets.organizationId))!,
  ];
  // "expired" includes active rows past their expiry that the cleanup job has not processed yet.
  if (query.state === "active")
    filters.push(and(eq(secrets.state, "active"), gt(secrets.expiresAt, now))!);
  if (query.state === "expired")
    filters.push(
      or(
        eq(secrets.state, "expired"),
        and(eq(secrets.state, "active"), lte(secrets.expiresAt, now)),
      )!,
    );
  if (query.state === "consumed" || query.state === "revoked")
    filters.push(inArray(secrets.state, [query.state]));
  if (query.environment) filters.push(eq(secrets.environment, query.environment));
  if (query.q) filters.push(ilike(secrets.label, `%${escapeLike(query.q)}%`));

  const order = {
    created_desc: desc(secrets.createdAt),
    created_asc: asc(secrets.createdAt),
    expires_asc: asc(secrets.expiresAt),
    expires_desc: desc(secrets.expiresAt),
  }[query.sort];

  const where = and(...filters);
  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(secrets)
      .where(where)
      .orderBy(order, desc(secrets.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(secrets).where(where),
  ]);
  return {
    items: rows.map((r) => toReceipt(r, now)),
    total: countRow?.count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function secretStats(
  scope: SecretScope,
  now = new Date(),
): Promise<Record<"active" | "consumed" | "expired" | "revoked", number>> {
  const db = await getDb();
  const owner = scope.organizationId
    ? eq(secrets.organizationId, scope.organizationId)
    : and(eq(secrets.ownerUserId, scope.userId), isNull(secrets.organizationId));
  const rows = await db
    .select({
      state: sql<string>`CASE WHEN ${secrets.state} = 'active' AND ${secrets.expiresAt} <= ${now.toISOString()} THEN 'expired' ELSE ${secrets.state}::text END`,
      count: sql<number>`count(*)::int`,
    })
    .from(secrets)
    .where(owner)
    .groupBy(sql`1`);
  const out = { active: 0, consumed: 0, expired: 0, revoked: 0 };
  for (const r of rows) out[r.state as keyof typeof out] += r.count;
  return out;
}
