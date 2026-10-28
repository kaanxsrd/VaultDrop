import { Suspense } from "react";
import { PageTitle } from "@/components/dashboard/page-title";
import { Skeleton } from "@/components/ui/primitives";
import { SecretsTable } from "./secrets-table";

export const metadata = { title: "Secrets" };

export default function SecretsPage() {
  return (
    <>
      <PageTitle
        title="Secrets"
        description="Status, views and expiry for secrets you created. Search covers your private labels only."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <SecretsTable />
      </Suspense>
    </>
  );
}
