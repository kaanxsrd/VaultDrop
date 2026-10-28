/**
 * VaultDrop domain tables. Nothing here ever holds plaintext secrets, passphrases or link keys.
 * Encrypted payloads live in `secret_payloads`, separate from management metadata in `secrets`,
 * so payload rows can be hard-deleted the moment a secret leaves the `active` state.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { KdfParams } from "@/lib/crypto/envelope";
import { organization, user } from "./auth";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const secretState = pgEnum("secret_state", ["active", "consumed", "expired", "revoked"]);
export const revokeReason = pgEnum("revoke_reason", [
  "owner",
  "receipt",
  "attempts_exceeded",
  "admin",
  "account_deleted",
]);
export const credentialEnv = pgEnum("credential_env", ["live", "test"]);

export const secrets = pgTable(
  "secrets",
  {
    /** 128-bit random identifier, base64url (22 chars). */
    id: text("id").primaryKey(),
    state: secretState("state").notNull().default("active"),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    /** base64url SHA-256 of the client-derived auth proof. Not usable to decrypt. */
    verifier: text("verifier").notNull(),
    kdf: jsonb("kdf").$type<KdfParams | null>(),
    maxViews: integer("max_views").notNull().default(1),
    viewCount: integer("view_count").notNull().default(0),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    maxFailedAttempts: integer("max_failed_attempts").notNull().default(5),
    /** Ciphertext size in bytes (already padded to 256-byte buckets client-side). */
    sizeBytes: integer("size_bytes").notNull(),
    /** Optional, creator-supplied, non-sensitive label (shown to the creator only). */
    label: text("label"),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    environment: credentialEnv("environment").notNull().default("live"),
    consumedAt: ts("consumed_at"),
    revokedAt: ts("revoked_at"),
    revokeReason: revokeReason("revoke_reason"),
    expiredAt: ts("expired_at"),
    lastViewedAt: ts("last_viewed_at"),
  },
  (t) => [
    index("secrets_state_expires_idx").on(t.state, t.expiresAt),
    index("secrets_owner_created_idx").on(t.ownerUserId, t.createdAt),
    index("secrets_org_created_idx").on(t.organizationId, t.createdAt),
    check(
      "secrets_views_check",
      sql`${t.viewCount} >= 0 AND ${t.viewCount} <= ${t.maxViews} AND ${t.maxViews} BETWEEN 1 AND 100`,
    ),
    check("secrets_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export const secretPayloads = pgTable("secret_payloads", {
  secretId: text("secret_id")
    .primaryKey()
    .references(() => secrets.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  /** base64url */
  iv: text("iv").notNull(),
  /** base64url AES-256-GCM ciphertext + tag */
  ciphertext: text("ciphertext").notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** First characters of the token, safe to display (e.g. `vd_live_AbCd`). */
    prefix: text("prefix").notNull(),
    /** SHA-256 of the full token (tokens are 256-bit random, so a fast hash is appropriate). */
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull(),
    environment: credentialEnv("environment").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastUsedAt: ts("last_used_at"),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("api_keys_token_hash_unique").on(t.tokenHash),
    index("api_keys_user_idx").on(t.userId),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    /** `apikey:<id>` or `user:<id>` */
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key] }),
    index("idempotency_created_idx").on(t.createdAt),
  ],
);

/** Fixed-window counters used when Redis is not configured. Keys are hashed; no raw IPs. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  count: integer("count").notNull(),
  expiresAt: ts("expires_at").notNull(),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    subject: text("subject").notNull(),
    period: text("period").notNull(),
    metric: text("metric").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.subject, t.period, t.metric] })],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    /** `user:<id>` or `org:<id>` */
    subject: text("subject").notNull(),
    plan: text("plan").notNull(),
    status: text("status").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_subject_unique").on(t.subject),
    uniqueIndex("subscriptions_stripe_sub_unique").on(t.stripeSubscriptionId),
  ],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    url: text("url").notNull(),
    /** Signing secret, encrypted at rest with APP_SECRET-derived key (AES-256-GCM). */
    secretEncrypted: text("secret_encrypted").notNull(),
    events: text("events").array().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    disabledAt: ts("disabled_at"),
  },
  (t) => [index("webhook_endpoints_user_idx").on(t.userId)],
);

export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "succeeded",
  "failed",
  "dead",
]);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    /** Metadata-only event body. Never contains ciphertext, keys or plaintext. */
    payload: jsonb("payload").notNull(),
    status: webhookDeliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    deliveredAt: ts("delivered_at"),
  },
  (t) => [
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("webhook_deliveries_endpoint_idx").on(t.endpointId, t.createdAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_user_created_idx").on(t.userId, t.createdAt),
    index("audit_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

/** Per-user preferences that are not part of Better Auth's user model. */
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  notifyOnRead: boolean("notify_on_read").notNull().default(true),
  /** Days to keep secret metadata after a secret reaches a terminal state. */
  metadataRetentionDays: integer("metadata_retention_days").notNull().default(30),
  defaultExpirySeconds: integer("default_expiry_seconds").notNull().default(86_400),
});

export const jobRunStatus = pgEnum("job_run_status", ["running", "succeeded", "failed"]);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    job: text("job").notNull(),
    status: jobRunStatus("status").notNull(),
    attempt: integer("attempt").notNull().default(1),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    error: text("error"),
    stats: jsonb("stats").$type<Record<string, number>>(),
  },
  (t) => [index("job_runs_job_started_idx").on(t.job, t.startedAt)],
);
