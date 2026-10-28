import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Badge, Card } from "@/components/ui/primitives";
import { PLANS, PUBLIC_PLANS } from "@/config/plans";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { platformStats, rateLimitPressure, recentAudit, searchUsers } from "@/server/admin";
import { requireAdmin } from "@/server/auth/session";
import { jobHealth, recentJobRuns } from "@/server/jobs/runner";
import { runJobAction, setPlanAction, toggleBanAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

const btn =
  "inline-flex h-8 items-center rounded-lg border border-input bg-card px-3 text-[13px] font-medium hover:bg-muted";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAdmin();
  const { q = "" } = await searchParams;
  const [stats, users, jobs, runs, auditLog, pressure] = await Promise.all([
    platformStats(),
    searchUsers(q.slice(0, 80)),
    jobHealth(),
    recentJobRuns(15),
    recentAudit(30),
    rateLimitPressure(),
  ]);

  return (
    <div className="bg-subtle min-h-dvh">
      <header className="border-border bg-background border-b">
        <div className="container-page flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge variant="warning">Admin</Badge>
          </div>
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm">
            Back to dashboard
          </Link>
        </div>
      </header>
      <main id="main" className="container-page flex flex-col gap-8 py-8">
        <p className="text-muted-foreground text-sm">
          Signed in as {session.user.email}. Admins can manage accounts and operations. There is no
          way to view secret contents or recover destroyed secrets.
        </p>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {[
            ["Users", stats.users],
            ["Organizations", stats.organizations],
            ["Active sessions", stats.activeSessions],
            ["Secrets (24h)", stats.created24h],
            ["Active secrets", stats.secrets.active ?? 0],
            ["Opened", stats.secrets.consumed ?? 0],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-semibold">Background jobs</h2>
            <ul className="divide-border mt-3 divide-y text-sm">
              {jobs.map((j) => (
                <li key={j.job} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-mono text-xs">{j.job}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {j.lastSuccessAt ? formatRelative(j.lastSuccessAt) : "never"}
                    </span>
                    <Badge variant={j.healthy ? "default" : "destructive"}>
                      {j.healthy ? "healthy" : "stale"}
                    </Badge>
                    <form action={runJobAction}>
                      <input type="hidden" name="job" value={j.job} />
                      <button type="submit" className={btn}>
                        Run now
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
            <details className="text-muted-foreground mt-3 text-xs">
              <summary className="cursor-pointer">Recent runs</summary>
              <ul className="mt-2 space-y-1 font-mono">
                {runs.map((r) => (
                  <li key={r.id}>
                    {formatDateTime(r.startedAt)} {r.job} #{r.attempt} {r.status}
                    {r.error ? ` — ${r.error}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Rate-limit pressure (current windows)</h2>
            {pressure.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">No active rate-limit windows.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1 font-medium">Bucket</th>
                    <th className="py-1 font-medium">Clients</th>
                    <th className="py-1 font-medium">Max hits</th>
                  </tr>
                </thead>
                <tbody>
                  {pressure.map((p) => (
                    <tr key={p.bucket} className="border-border border-t">
                      <td className="py-1.5 font-mono text-xs">{p.bucket}</td>
                      <td className="py-1.5 tabular-nums">{p.clients}</td>
                      <td className="py-1.5 tabular-nums">{p.maxCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              Client identifiers are keyed pseudonyms; raw IPs are not stored.
            </p>
          </Card>
        </section>

        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold">Users</h2>
            <form className="flex gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Search email or name"
                aria-label="Search users"
                className="border-input bg-card h-8 rounded-lg border px-3 text-sm"
              />
              <button type="submit" className={btn}>
                Search
              </button>
            </form>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-2 font-medium">User</th>
                  <th className="py-2 font-medium">Joined</th>
                  <th className="py-2 font-medium">Plan</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-border border-t">
                    <td className="py-2">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {u.email} {u.role === "admin" && <Badge variant="warning">admin</Badge>}{" "}
                        {!u.emailVerified && <Badge variant="neutral">unverified</Badge>}
                      </div>
                    </td>
                    <td className="text-muted-foreground py-2">{formatDateTime(u.createdAt)}</td>
                    <td className="py-2">
                      <form action={setPlanAction} className="flex gap-1.5">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="plan"
                          defaultValue={u.plan ?? "free"}
                          aria-label={`Plan for ${u.email}`}
                          className="border-input bg-card h-8 rounded-lg border px-2 text-[13px]"
                        >
                          {PUBLIC_PLANS.map((p) => (
                            <option key={p} value={p}>
                              {PLANS[p].name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={btn}>
                          Set
                        </button>
                      </form>
                    </td>
                    <td className="py-2">
                      {u.banned ? (
                        <Badge variant="destructive">suspended</Badge>
                      ) : (
                        <Badge>active</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {u.id !== session.user.id && (
                        <form action={toggleBanAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="banned" value={String(!u.banned)} />
                          <button type="submit" className={btn}>
                            {u.banned ? "Unsuspend" : "Suspend"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Audit log (metadata only)</h2>
          <ul className="divide-border mt-3 divide-y font-mono text-xs">
            {auditLog.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                <span>{a.action}</span>
                {a.targetType && (
                  <span className="text-muted-foreground">
                    {a.targetType}:{a.targetId}
                  </span>
                )}
                {a.metadata && (
                  <span className="text-muted-foreground">{JSON.stringify(a.metadata)}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </div>
  );
}
