import { PageTitle } from "@/components/dashboard/page-title";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { PLANS } from "@/config/plans";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { billingEnabled, subscriptionFor } from "@/server/billing";
import { planFor, usageFor } from "@/server/entitlements";
import { BillingActions } from "./billing-actions";

export const metadata = { title: "Usage & billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await requireUser();
  const { checkout } = await searchParams;
  const orgId = session.session.activeOrganizationId ?? null;
  const subject = orgId ? `org:${orgId}` : `user:${session.user.id}`;
  const [plan, usage, sub] = await Promise.all([
    planFor({ userId: session.user.id, organizationId: orgId }),
    usageFor(subject),
    subscriptionFor(subject),
  ]);
  const l = plan.limits;
  const rows: [string, string][] = [
    [
      "Secrets this month",
      `${(usage.secrets_created ?? 0).toLocaleString()} / ${l.secretsPerMonth === null ? "unlimited" : l.secretsPerMonth.toLocaleString()}`,
    ],
    ["Maximum secret size", formatBytes(l.maxCiphertextBytes - 16)],
    ["Longest expiry", formatDuration(l.maxExpirySeconds)],
    ["Views per secret", String(l.maxViews)],
    ["API access", l.apiAccess ? `Yes · ${l.apiRequestsPerMinute} requests/min` : "No"],
    ["Webhooks", l.webhooks ? `Up to ${l.maxWebhookEndpoints} endpoints` : "No"],
    ["Teams & branding", l.teams ? "Yes" : "No"],
  ];

  return (
    <>
      <PageTitle
        title="Usage & billing"
        description={
          orgId ? "Billing for your active organization." : "Billing for your personal account."
        }
      />
      {checkout === "success" && (
        <Alert variant="success" className="mb-6">
          <span>
            Thanks! Your plan updates as soon as Stripe confirms the payment — usually within a few
            seconds. Refresh if it hasn&apos;t changed yet.
          </span>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{plan.name} plan</h2>
            {sub && (
              <Badge
                variant={
                  sub.status === "active" || sub.status === "trialing" ? "default" : "warning"
                }
              >
                {sub.status}
              </Badge>
            )}
          </div>
          {sub?.currentPeriodEnd && (
            <p className="text-muted-foreground mt-1 text-sm">
              {sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on {formatDateTime(sub.currentPeriodEnd)}
            </p>
          )}
          <dl className="divide-border mt-5 divide-y text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <BillingActions
          enabled={billingEnabled()}
          currentPlan={plan.id}
          hasCustomer={Boolean(sub?.stripeCustomerId)}
          plans={(["personal", "pro", "team"] as const).map((id) => ({
            id,
            name: PLANS[id].name,
            price: PLANS[id].priceMonthly ?? 0,
            perSeat: Boolean(PLANS[id].perSeat),
          }))}
        />
      </div>
    </>
  );
}
