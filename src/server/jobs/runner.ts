import "server-only";
import type { Duration } from "@vantedev/groundwork";
import type { JobRecord, Jobs } from "@vantedev/groundwork/jobs";
import { after } from "next/server";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { gw } from "@/server/groundwork";
import { errorInfo, logger } from "@/server/log";
import { expireDueSecrets, purgeTerminalMetadata } from "@/server/secrets/service";
import { deliverDueWebhooks } from "@/server/webhooks";

/**
 * Background jobs, run as groundwork schedules: each runs once per interval across every
 * instance, with up to 3 attempts (backoff from 5 s) and a history in gw_jobs. Every job is
 * idempotent, so a run retried after a crash is safe. groundwork adds its own hourly
 * schedules that delete expired rate-limit counters and idempotency keys.
 */
export const JOBS = {
  "expire-secrets": { every: "60s", run: async () => ({ ...(await expireDueSecrets()) }) },
  "deliver-webhooks": { every: "30s", run: async () => ({ ...(await deliverDueWebhooks()) }) },
  "purge-metadata": {
    every: "1h",
    run: async () => ({ ...(await purgeTerminalMetadata()) }),
  },
  "purge-housekeeping": {
    every: "1h",
    run: async () => ({ jobs: await (await jobs()).prune({ completedOlderThan: "7d" }) }),
  },
} satisfies Record<string, { every: Duration; run: () => Promise<Record<string, number>> }>;

const SCHEDULE_TYPE = "schedule:";

const globalForJobs = globalThis as unknown as {
  __vaultdropSchedules?: WeakSet<Jobs>;
  __vaultdropWorker?: Promise<unknown>;
};

/** groundwork's queue, with this app's schedules defined on it. */
async function jobs(): Promise<Jobs> {
  const queue = (await gw()).jobs;
  globalForJobs.__vaultdropSchedules ??= new WeakSet();
  const defined = globalForJobs.__vaultdropSchedules;
  if (!defined.has(queue)) {
    defined.add(queue);
    for (const [name, job] of Object.entries(JOBS)) {
      queue.schedule(name, { every: job.every }, () => job.run());
    }
  }
  return queue;
}

export interface JobResult {
  ok: boolean;
  attempts: number;
  stats?: unknown;
  error?: string;
}

function toResult(job: JobRecord | undefined): JobResult {
  if (!job) return { ok: false, attempts: 0 };
  if (job.status === "completed") return { ok: true, attempts: job.attempts, stats: job.result };
  return job.lastError
    ? { ok: false, attempts: job.attempts, error: job.lastError }
    : { ok: false, attempts: job.attempts };
}

/** Every schedule: this app's jobs in order, then groundwork's. */
async function schedules(queue: Jobs) {
  const order: string[] = Object.keys(JOBS);
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
  const { schedules } = await queue.health();
  return [...schedules].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/**
 * Runs the named jobs now (every job by default), along with anything else that is due, and
 * reports each named job's latest run. A failed run is retried later with backoff.
 */
export async function runJobs(
  names?: readonly string[],
  options: { budgetMs?: number } = {},
): Promise<Record<string, JobResult>> {
  const queue = await jobs();
  const run = names ?? (await schedules(queue)).map((s) => s.name);
  for (const name of run) {
    if (!(await queue.trigger(name))) throw new AppError("not_found", `Unknown job '${name}'.`);
  }
  await queue.runOnce({ budgetMs: options.budgetMs ?? 50_000 });
  const results: Record<string, JobResult> = {};
  for (const name of run) {
    const [latest] = await queue.list({ type: `${SCHEDULE_TYPE}${name}`, limit: 1 });
    results[name] = toResult(latest);
  }
  return results;
}

export async function runJob(name: string): Promise<JobResult> {
  const results = await runJobs([name]);
  return results[name] ?? { ok: false, attempts: 0 };
}

export interface JobHealth {
  job: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  healthy: boolean;
}

/** A job is unhealthy if it has not succeeded within 3× its interval. */
export async function jobHealth(): Promise<JobHealth[]> {
  return (await schedules(await jobs())).map((s) => ({
    job: s.name,
    lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: s.lastFailureAt?.toISOString() ?? null,
    healthy: s.healthy,
  }));
}

/** The latest runs, newest first. A retried run is one row; `attempt` counts its tries. */
export async function recentJobRuns(limit = 50) {
  const queue = await jobs();
  const runs = await queue.list({
    type: (await schedules(queue)).map((s) => `${SCHEDULE_TYPE}${s.name}`),
    limit,
  });
  return runs.map((run) => ({
    id: run.id,
    job: run.type.slice(SCHEDULE_TYPE.length),
    status: run.status,
    attempt: run.attempts,
    startedAt: run.startedAt ?? run.createdAt,
    error: run.lastError,
  }));
}

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

/**
 * In-process worker (default). It checks for due work every 5 seconds; with several instances,
 * each job still runs once per interval. Deployments with JOBS_IN_PROCESS=false call
 * /api/internal/jobs from cron instead.
 */
export function startScheduler(): void {
  if (globalForJobs.__vaultdropWorker) return;
  globalForJobs.__vaultdropWorker = jobs()
    .then((queue) => queue.work({ concurrency: 4, pollInterval: "5s" }))
    .catch((error: unknown) => {
      logger.error({ err: errorInfo(error) }, "job worker stopped");
      globalForJobs.__vaultdropWorker = undefined;
    });
  logger.info({ jobs: Object.keys(JOBS) }, "in-process job scheduler started");
}
