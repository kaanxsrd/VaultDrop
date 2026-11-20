CREATE TABLE "gw_idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"fingerprint" text NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"response" text,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gw_idempotency_keys_expires_at_idx" ON "gw_idempotency_keys" USING btree ("expires_at");