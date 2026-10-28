import "server-only";
import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Plan } from "@/config/plans";
import { newId, openAtRest, randomToken, safeEqual, sealAtRest } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { audit, WEBHOOK_EVENTS } from "@/server/events";
import { errorInfo, logger } from "@/server/log";

export const SIGNATURE_HEADER = "VaultDrop-Signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;
const RETRY_SCHEDULE_SECONDS = [60, 300, 1800, 7200, 21_600, 43_200, 86_400];
const MAX_ATTEMPTS = RETRY_SCHEDULE_SECONDS.length + 1;
const DISABLE_AFTER_CONSECUTIVE_FAILURES = 50;
const LEASE_SECONDS = 120;

export const createWebhookSchema = z.object({
  url: z.url().max(2048),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1)
    .default([...WEBHOOK_EVENTS]),
});

/** `t=<unix>,v1=<hex hmac-sha256(secret, "<t>.<body>")>` */
export function signPayload(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

/** Reference verifier (also shown in the docs). Rejects stale timestamps to prevent replays. */
export function verifySignature(
  secret: string,
  header: string,
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return safeEqual(expected, parts.v1);
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4.some((re) => re.test(ip));
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80")
  );
}

/** SSRF guard: webhook targets must be public https endpoints (http://localhost allowed in dev). */
export async function assertDeliverableUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  const dev = env().NODE_ENV !== "production";
  const localDev = dev && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localDev)
    throw new AppError("validation_failed", "Webhook URLs must use https.");
  if (url.username || url.password)
    throw new AppError("validation_failed", "Webhook URLs cannot contain credentials.");
  if (localDev) return url;
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0)
    throw new AppError("validation_failed", "Webhook host does not resolve.");
  if (addresses.some((a) => isPrivateAddress(a.address)))
    throw new AppError("validation_failed", "Webhook URLs must point to a public address.");
  return url;
}

export async function createWebhookEndpoint(
  userId: string,
  plan: Plan,
  raw: unknown,
  organizationId: string | null,
) {
  if (!plan.limits.webhooks)
    throw new AppError("plan_restricted", "Webhooks require the Pro plan or higher.");
  const parsed = createWebhookSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("validation_failed", "Invalid webhook configuration.");
  await assertDeliverableUrl(parsed.data.url);
  const db = await getDb();
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId))) as [{ count: number }];
  if (count >= plan.limits.maxWebhookEndpoints)
    throw new AppError(
      "quota_exceeded",
      `Your plan allows ${plan.limits.maxWebhookEndpoints} webhook endpoints.`,
    );

  const secret = `whsec_${randomToken(32)}`;
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      id: newId("wh"),
      userId,
      organizationId,
      url: parsed.data.url,
      secretEncrypted: sealAtRest(secret),
      events: parsed.data.events,
    })
    .returning();
  await audit(db, {
    userId,
    organizationId,
    action: "webhook.created",
    targetType: "webhook",
    targetId: row!.id,
  });
  return { secret, endpoint: publicEndpoint(row!) };
}

export function publicEndpoint(row: typeof webhookEndpoints.$inferSelect) {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt.toISOString(),
    disabledAt: row.disabledAt?.toISOString() ?? null,
  };
}

export async function listWebhookEndpoints(userId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId))
    .orderBy(desc(webhookEndpoints.createdAt));
  return rows.map(publicEndpoint);
}

export async function deleteWebhookEndpoint(userId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .delete(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)))
    .returning({ id: webhookEndpoints.id });
  if (rows.length === 0) throw new AppError("not_found", "Webhook endpoint not found.");
  await audit(db, { userId, action: "webhook.deleted", targetType: "webhook", targetId: id });
}

export async function recentDeliveries(userId: string, limit = 25) {
  const db = await getDb();
  return db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      eventType: webhookDeliveries.eventType,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      lastStatusCode: webhookDeliveries.lastStatusCode,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(eq(webhookEndpoints.userId, userId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

type Sender = (url: string, init: RequestInit) => Promise<{ status: number }>;
const defaultSender: Sender = async (url, init) => {
  await assertDeliverableUrl(url);
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  await res.body?.cancel();
  return { status: res.status };
};

/**
 * Delivers due webhook events. Rows are leased with FOR UPDATE SKIP LOCKED + a short lease, so
 * multiple workers never send the same attempt concurrently. Retries use exponential backoff.
 */
export async function deliverDueWebhooks(
  opts: { now?: Date; batchSize?: number; send?: Sender } = {},
): Promise<{ delivered: number; failed: number }> {
  const db = await getDb();
  const now = opts.now ?? new Date();
  const send = opts.send ?? defaultSender;

  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
      .where(
        and(
          inArray(webhookDeliveries.status, ["pending", "failed"]),
          lte(webhookDeliveries.nextAttemptAt, now),
          eq(webhookEndpoints.enabled, true),
        ),
      )
      .orderBy(webhookDeliveries.nextAttemptAt)
      .limit(opts.batchSize ?? 50)
      .for("update", { of: webhookDeliveries, skipLocked: true });
    if (due.length > 0) {
      await tx
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(now.getTime() + LEASE_SECONDS * 1000) })
        .where(
          inArray(
            webhookDeliveries.id,
            due.map((d) => d.delivery.id),
          ),
        );
    }
    return due;
  });

  let delivered = 0;
  let failed = 0;
  for (const { delivery, endpoint } of claimed) {
    const body = JSON.stringify(delivery.payload);
    let status: number | null = null;
    let errorMessage: string | null = null;
    try {
      const secret = openAtRest(endpoint.secretEncrypted);
      const res = await send(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "VaultDrop-Webhooks/1",
          [SIGNATURE_HEADER]: signPayload(secret, body, Math.floor(now.getTime() / 1000)),
          "VaultDrop-Event-Id": delivery.eventId,
          "VaultDrop-Event-Type": delivery.eventType,
          "VaultDrop-Delivery-Attempt": String(delivery.attempts + 1),
        },
        body,
      });
      status = res.status;
    } catch (error) {
      errorMessage = errorInfo(error).message.slice(0, 200);
    }

    const attempts = delivery.attempts + 1;
    if (status !== null && status >= 200 && status < 300) {
      delivered++;
      await db
        .update(webhookDeliveries)
        .set({
          status: "succeeded",
          attempts,
          lastStatusCode: status,
          lastError: null,
          deliveredAt: now,
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      await db
        .update(webhookEndpoints)
        .set({ consecutiveFailures: 0 })
        .where(eq(webhookEndpoints.id, endpoint.id));
    } else {
      failed++;
      const dead = attempts >= MAX_ATTEMPTS;
      const delay =
        RETRY_SCHEDULE_SECONDS[Math.min(attempts - 1, RETRY_SCHEDULE_SECONDS.length - 1)]!;
      await db
        .update(webhookDeliveries)
        .set({
          status: dead ? "dead" : "failed",
          attempts,
          lastStatusCode: status,
          lastError: errorMessage ?? `HTTP ${status}`,
          nextAttemptAt: new Date(now.getTime() + delay * 1000),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      const failures = endpoint.consecutiveFailures + 1;
      await db
        .update(webhookEndpoints)
        .set({
          consecutiveFailures: failures,
          ...(failures >= DISABLE_AFTER_CONSECUTIVE_FAILURES
            ? { enabled: false, disabledAt: now }
            : {}),
        })
        .where(eq(webhookEndpoints.id, endpoint.id));
      logger.warn({ deliveryId: delivery.id, attempts, status, dead }, "webhook delivery failed");
    }
  }
  return { delivered, failed };
}
