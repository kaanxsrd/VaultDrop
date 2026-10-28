import { sql } from "drizzle-orm";
import { CircleCheck, CircleX, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/site/marketing";
import { formatRelative } from "@/lib/utils";
import { getDb } from "@/server/db/client";
import { env } from "@/server/env";
import { type JobHealth, jobHealth } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Status",
  description: "Live health checks for this VaultDrop deployment.",
};

async function check(): Promise<{ db: boolean; latencyMs: number | null; jobs: JobHealth[] }> {
  const started = performance.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return {
      db: true,
      latencyMs: Math.round(performance.now() - started),
      jobs: await jobHealth(),
    };
  } catch {
    return { db: false, latencyMs: null, jobs: [] };
  }
}

const JOB_LABELS: Record<string, string> = {
  "expire-secrets": "Expiry enforcement",
  "deliver-webhooks": "Webhook delivery",
  "purge-metadata": "Metadata retention",
  "purge-housekeeping": "Housekeeping",
};

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="flex items-center gap-2.5 text-sm font-medium">
        {ok ? (
          <CircleCheck className="text-primary size-4" aria-label="Operational" />
        ) : (
          <CircleX className="text-destructive size-4" aria-label="Degraded" />
        )}
        {label}
      </span>
      <span className="text-muted-foreground text-sm">{detail}</span>
    </li>
  );
}

export default async function StatusPage() {
  const { db, latencyMs, jobs } = await check();
  const external = env().STATUS_PAGE_URL;
  return (
    <>
      <PageHeader
        eyebrow="Status"
        title={db ? "All core checks are passing" : "Service is degraded"}
        description="Live checks run by this server when you load this page. This is not a historical uptime record."
      />
      <div className="container-page max-w-3xl py-12">
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          <Row ok label="Web application" detail="Responding" />
          <Row ok={db} label="Database" detail={db ? `${latencyMs} ms` : "Unreachable"} />
          <Row
            ok
            label="Secret redemption (expiry enforced on every request)"
            detail={db ? "Available" : "Unavailable"}
          />
          {jobs.map((j) => (
            <Row
              key={j.job}
              ok={j.healthy}
              label={JOB_LABELS[j.job] ?? j.job}
              detail={
                j.lastSuccessAt ? `Last run ${formatRelative(j.lastSuccessAt)}` : "Not run yet"
              }
            />
          ))}
        </ul>
        <p className="text-muted-foreground mt-4 text-sm">
          Background jobs keep storage tidy; expiry is also enforced on every request, so a delayed
          job never makes an expired secret readable.
        </p>
        {external && (
          <a
            href={external}
            rel="noopener noreferrer"
            className="text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
          >
            Incident history on our external status provider <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </>
  );
}
