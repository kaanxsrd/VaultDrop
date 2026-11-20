CREATE TABLE "gw_job_schedules" (
	"name" text PRIMARY KEY NOT NULL,
	"every" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gw_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"dedupe_key" text,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gw_jobs_status_check" CHECK (status in ('pending', 'running', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX "gw_jobs_claim_idx" ON "gw_jobs" USING btree ("priority" DESC NULLS LAST,"run_at","id") WHERE status in ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "gw_jobs_dedupe_idx" ON "gw_jobs" USING btree ("type","dedupe_key") WHERE dedupe_key is not null and status in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "gw_jobs_finished_idx" ON "gw_jobs" USING btree ("completed_at") WHERE status in ('completed', 'failed', 'cancelled');