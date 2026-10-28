import "server-only";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { after } from "next/server";
import { newId } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { jobRuns } from "@/server/db/schema";
import { env } from "@/server/env";
import { purgeIdempotencyKeys } from "@/server/idempotency";
import { errorInfo, logger } from "@/server/log";
import { purgeExpiredRateLimits } from "@/server/ratelimit";
import { expireDueSecrets, purgeTerminalMetadata } from "@/server/secrets/service";
import { deliverDueWebhooks } from "@/server/webhooks";

/**
 * Background jobs. Every job is idempotent and safe to run concurrently on several instances
 * (conditional updates / SKIP LOCKED), so the scheduler needs no distributed lock for correctness.
 */
export const JOBS = {
  "expire-secrets": { everySeconds: 60, run: async () => ({ ...(await expireDueSecrets()) }) },
  "deliver-webhooks": { everySeconds: 30, run: async () => ({ ...(await deliverDueWebhooks()) }) },
  "purge-metadata": {
    everySeconds: 3600,
    run: async () => ({ ...(await purgeTerminalMetadata()) }),
  },
  "purge-housekeeping": {
    everySeconds: 3600,
    run: async () => ({
      rateLimits: await purgeExpiredRateLimits(),
      idempotencyKeys: await purgeIdempotencyKeys(),
      jobRuns: await purgeJobRuns(),
    }),
  },
} satisfies Record<string, { everySeconds: number; run: () => Promise<Record<string, number>> }>;

export type JobName = keyof typeof JOBS;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs a job with bounded retries and records each attempt in job_runs for monitoring. */
export async function runJob(
  name: JobName,
  opts: { retryDelayMs?: number } = {},
): Promise<{ ok: boolean; stats?: Record<string, number> }> {
  const db = await getDb();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const id = newId("job");
    await db.insert(jobRuns).values({ id, job: name, status: "running", attempt });
    try {
      const stats = await JOBS[name].run();
      await db
        .update(jobRuns)
        .set({ status: "succeeded", finishedAt: new Date(), stats })
        .where(eq(jobRuns.id, id));
      return { ok: true, stats };
    } catch (error) {
      const info = errorInfo(error);
      await db
        .update(jobRuns)
        .set({ status: "failed", finishedAt: new Date(), error: `${info.name}: ${info.message}` })
        .where(eq(jobRuns.id, id));
      logger.error({ job: name, attempt, err: info }, "job attempt failed");
      if (attempt < MAX_ATTEMPTS) await sleep((opts.retryDelayMs ?? 1000) * 2 ** (attempt - 1));
    }
  }
  return { ok: false };
}

async function purgeJobRuns(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .delete(jobRuns)
    .where(lt(jobRuns.startedAt, new Date(Date.now() - 7 * 86_400_000)))
    .returning({ id: jobRuns.id });
  return rows.length;
}

export interface JobHealth {
  job: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  healthy: boolean;
}

/** A job is unhealthy if it has not succeeded within 3× its interval. */
export async function jobHealth(): Promise<JobHealth[]> {
  const db = await getDb();
  const rows = await db
    .select({
      job: jobRuns.job,
      lastSuccess: sql<Date | null>`max(case when ${jobRuns.status} = 'succeeded' then ${jobRuns.finishedAt} end)`,
      lastFailure: sql<Date | null>`max(case when ${jobRuns.status} = 'failed' then ${jobRuns.finishedAt} end)`,
    })
    .from(jobRuns)
    .groupBy(jobRuns.job);
  const byName = new Map(rows.map((r) => [r.job, r]));
  return (Object.keys(JOBS) as JobName[]).map((job) => {
    const r = byName.get(job);
    const lastSuccess = r?.lastSuccess ? new Date(r.lastSuccess) : null;
    return {
      job,
      lastSuccessAt: lastSuccess?.toISOString() ?? null,
      lastFailureAt: r?.lastFailure ? new Date(r.lastFailure).toISOString() : null,
      healthy:
        lastSuccess !== null && Date.now() - lastSuccess.getTime() < JOBS[job].everySeconds * 3000,
    };
  });
}

export async function recentJobRuns(limit = 50) {
  const db = await getDb();
  return db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit);
}

export async function failedJobRunsSince(since: Date) {
  const db = await getDb();
  return db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.status, "failed"), sql`${jobRuns.startedAt} >= ${since}`));
}

const globalForJobs = globalThis as unknown as { __vaultdropScheduler?: NodeJS.Timeout[] };

/** In-process scheduler (default). For multiple instances you may instead call /api/internal/jobs from cron. */
/**
 * Serverless deployments (JOBS_IN_PROCESS=false) have no scheduler loop, so after a request that may
 * have queued webhook deliveries, deliver them once the response has been sent. Deliveries are
 * leased with SKIP LOCKED, so this never double-sends alongside the cron trigger.
 */
export function deliverWebhooksAfterResponse(): void {
  if (env().JOBS_IN_PROCESS) return;
  after(async () => {
    try {
      await deliverDueWebhooks();
    } catch (error) {
      logger.warn({ err: errorInfo(error) }, "post-response webhook delivery failed");
    }
  });
}

export function startScheduler(): void {
  if (globalForJobs.__vaultdropScheduler) return;
  const running = new Set<JobName>();
  globalForJobs.__vaultdropScheduler = (Object.keys(JOBS) as JobName[]).map((name) => {
    const tick = async () => {
      if (running.has(name)) return; // bound concurrency: one run per job per process
      running.add(name);
      try {
        await runJob(name);
      } finally {
        running.delete(name);
      }
    };
    const timer = setInterval(() => void tick(), JOBS[name].everySeconds * 1000);
    timer.unref();
    setTimeout(() => void tick(), 5_000).unref();
    return timer;
  });
  logger.info({ jobs: Object.keys(JOBS) }, "in-process job scheduler started");
}
