import "server-only";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Plan } from "@/config/plans";
import { newId, randomToken, sha256 } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { apiKeys } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { audit } from "@/server/events";

export const API_SCOPES = [
  "secrets:create",
  "secrets:read",
  "secrets:burn",
  "webhooks:manage",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  environment: z.enum(["live", "test"]).default("live"),
  scopes: z
    .array(z.enum(API_SCOPES))
    .min(1)
    .default(["secrets:create", "secrets:read", "secrets:burn"]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const TOKEN_RE = /^vd_(live|test)_[A-Za-z0-9_-]{43}$/;

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  environment: "live" | "test";
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

function toRecord(row: typeof apiKeys.$inferSelect): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    environment: row.environment,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Creates a key and returns the full token exactly once. Only its SHA-256 is stored. */
export async function createApiKey(
  userId: string,
  plan: Plan,
  raw: unknown,
  organizationId: string | null = null,
): Promise<{ token: string; key: ApiKeyRecord }> {
  if (!plan.limits.apiAccess)
    throw new AppError("plan_restricted", "API access requires the Pro plan or higher.");
  const parsed = createApiKeySchema.safeParse(raw);
  if (!parsed.success) throw new AppError("validation_failed", "Invalid API key request.");
  const input = parsed.data;
  const db = await getDb();
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))) as [{ count: number }];
  if (count >= plan.limits.maxApiKeys)
    throw new AppError(
      "quota_exceeded",
      `Your plan allows ${plan.limits.maxApiKeys} active API keys.`,
    );

  const token = `vd_${input.environment}_${randomToken(32)}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      id: newId("ak"),
      userId,
      organizationId,
      name: input.name,
      prefix: token.slice(0, 16),
      tokenHash: sha256(token),
      scopes: input.scopes,
      environment: input.environment,
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null,
    })
    .returning();
  await audit(db, {
    userId,
    organizationId,
    action: "api_key.created",
    targetType: "api_key",
    targetId: row!.id,
    metadata: { environment: input.environment },
  });
  return { token, key: toRecord(row!) };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(toRecord);
}

export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
  const db = await getDb();
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (rows.length === 0) throw new AppError("not_found", "API key not found.");
  await audit(db, { userId, action: "api_key.revoked", targetType: "api_key", targetId: keyId });
}

export interface AuthenticatedKey {
  id: string;
  userId: string;
  organizationId: string | null;
  scopes: string[];
  environment: "live" | "test";
}

export async function authenticateApiKey(token: string): Promise<AuthenticatedKey | null> {
  if (!TOKEN_RE.test(token)) return null;
  const db = await getDb();
  const now = new Date();
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.tokenHash, sha256(token)),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.id));
  }
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    scopes: row.scopes,
    environment: row.environment,
  };
}
