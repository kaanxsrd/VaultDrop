import { PageTitle, PlanGate } from "@/components/dashboard/page-title";
import { requireUser } from "@/server/auth/session";
import { planFor } from "@/server/entitlements";
import { TeamManager } from "./team-manager";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await requireUser();
  const personalPlan = await planFor({ userId: session.user.id });
  const activeOrg = session.session.activeOrganizationId ?? null;
  return (
    <>
      <PageTitle
        title="Team"
        description="Shared workspaces with role-based access. Members see metadata for the organization's secrets, never their content."
      />
      {personalPlan.limits.teams || activeOrg ? (
        <TeamManager currentUserId={session.user.id} canCreate={personalPlan.limits.teams} />
      ) : (
        <PlanGate feature="Teams" plan="the Team plan" />
      )}
    </>
  );
}
