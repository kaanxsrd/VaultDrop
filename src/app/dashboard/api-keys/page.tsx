import Link from "next/link";
import { PageTitle, PlanGate } from "@/components/dashboard/page-title";
import { listApiKeys } from "@/server/apikeys";
import { requireUser } from "@/server/auth/session";
import { planFor } from "@/server/entitlements";
import { ApiKeysManager } from "./api-keys-manager";

export const metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const session = await requireUser();
  const plan = await planFor({
    userId: session.user.id,
    organizationId: session.session.activeOrganizationId ?? null,
  });
  return (
    <>
      <PageTitle
        title="API keys"
        description={
          <>
            Authenticate the REST API and CLI. See the{" "}
            <Link href="/docs/api" className="underline underline-offset-2">
              API reference
            </Link>
            .
          </>
        }
      />
      {plan.limits.apiAccess ? (
        <ApiKeysManager initial={await listApiKeys(session.user.id)} />
      ) : (
        <PlanGate feature="API access" plan="Pro and above" />
      )}
    </>
  );
}
