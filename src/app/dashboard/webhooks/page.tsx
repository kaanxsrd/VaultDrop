import Link from "next/link";
import { PageTitle, PlanGate } from "@/components/dashboard/page-title";
import { requireUser } from "@/server/auth/session";
import { planFor } from "@/server/entitlements";
import { listWebhookEndpoints, recentDeliveries } from "@/server/webhooks";
import { WebhooksManager } from "./webhooks-manager";

export const metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const session = await requireUser();
  const plan = await planFor({
    userId: session.user.id,
    organizationId: session.session.activeOrganizationId ?? null,
  });
  if (!plan.limits.webhooks) {
    return (
      <>
        <PageTitle title="Webhooks" />
        <PlanGate feature="Webhooks" plan="Pro and above" />
      </>
    );
  }
  const [endpoints, deliveries] = await Promise.all([
    listWebhookEndpoints(session.user.id),
    recentDeliveries(session.user.id),
  ]);
  return (
    <>
      <PageTitle
        title="Webhooks"
        description={
          <>
            Signed, retried event notifications.{" "}
            <Link href="/docs#webhooks" className="underline underline-offset-2">
              Verifying signatures
            </Link>
          </>
        }
      />
      <WebhooksManager
        endpoints={endpoints}
        deliveries={deliveries.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
      />
    </>
  );
}
