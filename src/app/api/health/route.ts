import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { jobHealth } from "@/server/jobs/runner";
import { errorInfo, logger } from "@/server/log";

export const dynamic = "force-dynamic";

/** Readiness probe: verifies the database answers within the request. Reports job freshness. */
export async function GET() {
  const started = performance.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    const jobs = await jobHealth();
    return Response.json(
      { status: "ok", database: "ok", jobs, latencyMs: Math.round(performance.now() - started) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: errorInfo(error) }, "health check failed");
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
