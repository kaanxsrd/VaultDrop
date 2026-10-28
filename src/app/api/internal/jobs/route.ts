import { safeEqual } from "@/server/crypto";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { json, type RouteContext, route } from "@/server/http/route";
import { JOBS, type JobName, runJob } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";
// All jobs run sequentially in one invocation; give them room on serverless platforms.
export const maxDuration = 60;

/**
 * External job trigger, authorized by `Authorization: Bearer $CRON_SECRET`.
 *   GET  — what Vercel Cron sends (it adds the bearer header automatically when CRON_SECRET is set)
 *   POST — `bun run jobs:run`, Kubernetes CronJobs, other schedulers
 * `?job=<name>` runs a single job; otherwise all of them.
 */
async function handle({ req }: RouteContext<Record<string, never>>) {
  const secret = env().CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(provided, secret))
    throw new AppError("unauthorized", "Invalid cron credentials.");
  const job = new URL(req.url).searchParams.get("job");
  const names = job ? [job] : Object.keys(JOBS);
  const results: Record<string, unknown> = {};
  for (const name of names) {
    if (!(name in JOBS)) throw new AppError("not_found", `Unknown job '${name}'.`);
    results[name] = await runJob(name as JobName);
  }
  return json({ results });
}

export const GET = route(handle);
export const POST = route(handle);
