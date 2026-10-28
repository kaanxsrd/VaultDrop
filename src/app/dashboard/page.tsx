import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/dashboard/page-title";
import { StateBadge } from "@/components/reveal/receipt-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { planFor, usageFor } from "@/server/entitlements";
import { listSecrets, secretStats } from "@/server/secrets/queries";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await requireUser();
  const orgId = session.session.activeOrganizationId ?? null;
  const scope = { userId: session.user.id, organizationId: orgId };
  const [stats, recent, plan, usage] = await Promise.all([
    secretStats(scope),
    listSecrets(scope, { state: "all", sort: "created_desc", page: 1, pageSize: 5 }),
    planFor({ userId: session.user.id, organizationId: orgId }),
    usageFor(orgId ? `org:${orgId}` : `user:${session.user.id}`),
  ]);
  const used = usage.secrets_created ?? 0;
  const quota = plan.limits.secretsPerMonth;

  const tiles = [
    { label: "Active", value: stats.active, href: "/dashboard/secrets?state=active" },
    { label: "Opened", value: stats.consumed, href: "/dashboard/secrets?state=consumed" },
    { label: "Expired", value: stats.expired, href: "/dashboard/secrets?state=expired" },
    { label: "Destroyed", value: stats.revoked, href: "/dashboard/secrets?state=revoked" },
  ];

  return (
    <>
      <PageTitle
        title={`Welcome back, ${session.user.name.split(" ")[0]}`}
        description="Metadata about the secrets you've shared. Contents are never stored in a readable form."
        actions={
          <Button asChild>
            <Link href="/#share">New secret</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="border-border bg-card shadow-soft hover:border-input rounded-xl border p-4 transition-colors"
          >
            <div className="text-muted-foreground text-sm">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
          </Link>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Secrets this month</span>
          <span className="text-muted-foreground tabular-nums">
            {used.toLocaleString()}{" "}
            {quota !== null ? `of ${quota.toLocaleString()}` : "· unlimited"}
          </span>
        </div>
        {quota !== null && (
          <div
            className="bg-muted mt-3 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={quota}
            aria-valuenow={used}
            aria-label="Monthly usage"
          >
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${Math.min(100, (used / quota) * 100)}%` }}
            />
          </div>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          {plan.name} plan · resets on the 1st (UTC)
        </p>
      </Card>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-semibold">Recent secrets</h2>
        <Link
          href="/dashboard/secrets"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="mt-3">
        {recent.items.length === 0 ? (
          <EmptyState
            icon={LockKeyhole}
            title="No secrets yet"
            description="Secrets you create while signed in appear here — status and expiry only, never the content."
            action={
              <Button asChild size="sm">
                <Link href="/#share">Share your first secret</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-border border-border bg-card divide-y rounded-xl border">
            {recent.items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {s.label ?? (
                      <span className="text-muted-foreground font-mono">{s.id.slice(0, 8)}…</span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Created {formatRelative(s.createdAt)} · {s.viewCount}/{s.maxViews} views
                  </div>
                </div>
                <StateBadge state={s.state} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
