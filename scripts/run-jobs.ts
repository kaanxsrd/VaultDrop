/**
 * External job trigger for deployments that set JOBS_IN_PROCESS=false (e.g. many web replicas,
 * serverless). Calls POST /api/internal/jobs with CRON_SECRET.
 *
 *   bun run jobs:run            # run all jobs once
 *   bun run jobs:run --loop     # run every 60s until stopped
 */

const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

async function once(): Promise<boolean> {
  const res = await fetch(`${base}/api/internal/jobs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => null);
  console.log(new Date().toISOString(), res.status, JSON.stringify(body));
  return res.ok;
}

async function main() {
  if (!secret) throw new Error("CRON_SECRET is not set");
  if (!process.argv.includes("--loop")) {
    process.exit((await once()) ? 0 : 1);
  }
  for (;;) {
    await once().catch((e: unknown) =>
      console.error("job trigger failed:", e instanceof Error ? e.message : e),
    );
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
