import { PageTitle } from "@/components/dashboard/page-title";
import { requireUser } from "@/server/auth/session";
import { SecurityPanels } from "./security-panels";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const session = await requireUser();
  return (
    <>
      <PageTitle
        title="Security"
        description="Sign-in methods, two-factor authentication and active sessions."
      />
      <SecurityPanels twoFactorEnabled={Boolean(session.user.twoFactorEnabled)} />
    </>
  );
}
