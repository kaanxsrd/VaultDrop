import { and, eq, isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { planFor } from "@/server/entitlements";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · VaultDrop" },
  robots: { index: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const db = await getDb();
  const [[unread], plan] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt))),
    planFor({
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId ?? null,
    }),
  ]);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <DashboardNav
        user={{ name: session.user.name, email: session.user.email }}
        isAdmin={(session.user as { role?: string | null }).role === "admin"}
        unread={unread?.count ?? 0}
        planName={plan.name}
      />
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
