import "server-only";
import { and, arrayContains, eq, isNull, or } from "drizzle-orm";
import { newId } from "@/server/crypto";
import type { Database, Transaction } from "@/server/db/client";
import {
  auditEvents,
  notifications,
  userSettings,
  webhookDeliveries,
  webhookEndpoints,
} from "@/server/db/schema";

export const WEBHOOK_EVENTS = [
  "secret.created",
  "secret.viewed",
  "secret.consumed",
  "secret.revoked",
  "secret.expired",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

/** Metadata-only event data. Typed so that ciphertext/keys cannot be added by accident. */
export interface SecretEventData {
  secretId: string;
  label: string | null;
  state: "active" | "consumed" | "expired" | "revoked";
  viewCount: number;
  maxViews: number;
  expiresAt: string;
  environment: "live" | "test";
}

/**
 * Transactional outbox: deliveries are inserted in the same transaction as the state change,
 * so an event is recorded if and only if the change commits. A worker delivers them later.
 */
export async function emitSecretEvent(
  tx: Database | Transaction,
  owner: { userId: string | null; organizationId: string | null },
  type: WebhookEventType,
  data: SecretEventData,
  now = new Date(),
): Promise<void> {
  if (!owner.userId) return;

  const endpoints = await tx
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.enabled, true),
        arrayContains(webhookEndpoints.events, [type]),
        owner.organizationId
          ? or(
              eq(webhookEndpoints.organizationId, owner.organizationId),
              and(
                eq(webhookEndpoints.userId, owner.userId),
                isNull(webhookEndpoints.organizationId),
              ),
            )
          : and(eq(webhookEndpoints.userId, owner.userId), isNull(webhookEndpoints.organizationId)),
      ),
    );

  const eventId = newId("evt");
  if (endpoints.length > 0) {
    const payload = { id: eventId, type, createdAt: now.toISOString(), data };
    await tx.insert(webhookDeliveries).values(
      endpoints.map((e) => ({
        id: newId("whd"),
        endpointId: e.id,
        eventId,
        eventType: type,
        payload,
        nextAttemptAt: now,
      })),
    );
  }

  if (type === "secret.consumed" || type === "secret.viewed") {
    const [settings] = await tx
      .select({ notify: userSettings.notifyOnRead })
      .from(userSettings)
      .where(eq(userSettings.userId, owner.userId));
    if (settings?.notify ?? true) {
      await tx.insert(notifications).values({
        id: newId("ntf"),
        userId: owner.userId,
        kind: type,
        title:
          type === "secret.consumed"
            ? "A secret was opened and destroyed"
            : "A multi-view secret was opened",
        body: data.label ? `Label: ${data.label}` : `Secret ${data.secretId.slice(0, 6)}…`,
        createdAt: now,
      });
    }
  }
}

export async function audit(
  tx: Database | Transaction,
  event: {
    userId?: string | null;
    organizationId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await tx.insert(auditEvents).values({
    id: newId("aud"),
    userId: event.userId ?? null,
    organizationId: event.organizationId ?? null,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    metadata: event.metadata ?? null,
  });
}
