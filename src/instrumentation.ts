/** Runs once per server process before requests are handled. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("@/server/db/client");
  await getDb();
  const { env } = await import("@/server/env");
  if (env().JOBS_IN_PROCESS) {
    const { startScheduler } = await import("@/server/jobs/runner");
    startScheduler();
  }
}
