CREATE TABLE "gw_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"rule" text NOT NULL,
	"used" double precision NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gw_rate_limits_expires_at_idx" ON "gw_rate_limits" USING btree ("expires_at");