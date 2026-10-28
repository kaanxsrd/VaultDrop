import { Bell } from "lucide-react";
import { EmptyState, PageTitle } from "@/components/dashboard/page-title";
import { cn, formatDateTime } from "@/lib/utils";
import { listNotifications } from "@/server/account";
import { requireUser } from "@/server/auth/session";
import { MarkAllRead } from "./mark-all-read";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await requireUser();
  const items = await listNotifications(session.user.id);
  const unread = items.some((n) => !n.readAt);
  return (
    <>
      <PageTitle
        title="Notifications"
        description="Read receipts and account events. Never includes secret content."
        actions={unread ? <MarkAllRead /> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="You'll be notified here when a secret you shared is opened. Turn this off in Settings."
        />
      ) : (
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3.5",
                !n.readAt && "bg-primary-soft/40",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  n.readAt ? "bg-transparent" : "bg-primary",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {n.title}
                  {!n.readAt && <span className="sr-only"> (unread)</span>}
                </div>
                {n.body && <div className="text-muted-foreground text-sm">{n.body}</div>}
              </div>
              <time
                className="text-muted-foreground text-xs whitespace-nowrap"
                dateTime={n.createdAt.toISOString()}
              >
                {formatDateTime(n.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
