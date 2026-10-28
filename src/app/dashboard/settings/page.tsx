import { PageTitle } from "@/components/dashboard/page-title";
import { getSettings } from "@/server/account";
import { requireUser } from "@/server/auth/session";
import { SettingsForms } from "./settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireUser();
  const settings = await getSettings(session.user.id);
  return (
    <>
      <PageTitle title="Settings" description="Profile, privacy and account lifecycle." />
      <SettingsForms
        name={session.user.name}
        email={session.user.email}
        notifyOnRead={settings.notifyOnRead}
      />
    </>
  );
}
