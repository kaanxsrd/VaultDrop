import "server-only";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { notifications, session as sessions, userSettings } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { audit } from "@/server/events";

export const settingsSchema = z.object({
  notifyOnRead: z.boolean().optional(),
  metadataRetentionDays: z.number().int().min(1).max(90).optional(),
  defaultExpirySeconds: z
    .number()
    .int()
    .min(60)
    .max(90 * 86400)
    .optional(),
});

export async function getSettings(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return (
    row ?? { userId, notifyOnRead: true, metadataRetentionDays: 30, defaultExpirySeconds: 86_400 }
  );
}

export async function updateSettings(userId: string, raw: unknown) {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("validation_failed", "Invalid settings.");
  const db = await getDb();
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({ target: userSettings.userId, set: parsed.data })
    .returning();
  return row!;
}

export async function listNotifications(userId: string, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllNotificationsRead(userId: string) {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/** Session list without bearer tokens: other sessions are identified by opaque ids only. */
export async function listSessions(userId: string, currentToken: string | null) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.updatedAt));
  return rows
    .filter((s) => s.expiresAt > new Date())
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      current: s.token === currentToken,
    }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const db = await getDb();
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  if (rows.length === 0) throw new AppError("not_found", "Session not found.");
  await audit(db, {
    userId,
    action: "session.revoked",
    targetType: "session",
    targetId: sessionId,
  });
}

export async function revokeOtherSessions(userId: string, currentSessionId: string) {
  const db = await getDb();
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)))
    .returning({ id: sessions.id });
  await audit(db, { userId, action: "session.revoked_others", metadata: { count: rows.length } });
  return rows.length;
}
