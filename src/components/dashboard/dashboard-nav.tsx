"use client";

import {
  Activity,
  Bell,
  BookOpen,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/overlays";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/secrets", label: "Secrets", icon: LockKeyhole },
  { href: "/dashboard/api-keys", label: "API keys", icon: KeyRound },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/billing", label: "Usage & billing", icon: CreditCard },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavList({
  onNavigate,
  isAdmin,
  unread,
}: {
  onNavigate?: () => void;
  isAdmin: boolean;
  unread: number;
}) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: Activity }] : NAV;
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active =
          item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
            {item.href === "/dashboard/notifications" && unread > 0 && (
              <span className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 text-[11px] font-medium tabular-nums">
                {unread}
              </span>
            )}
          </Link>
        );
      })}
      <Link
        href="/docs"
        onClick={onNavigate}
        className="text-muted-foreground hover:bg-muted/60 hover:text-foreground mt-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm"
      >
        <BookOpen className="size-4" aria-hidden /> Help & docs
      </Link>
    </nav>
  );
}

function SignOut() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground w-full justify-start"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut /> Sign out
    </Button>
  );
}

export function DashboardNav({
  user,
  isAdmin,
  unread,
  planName,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
  unread: number;
  planName: string;
}) {
  const [open, setOpen] = useState(false);
  const account = (
    <div className="border-border flex flex-col gap-1 border-t pt-3">
      <div className="px-2.5 pb-1">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="text-muted-foreground truncate text-xs">{user.email}</div>
        <div className="text-muted-foreground mt-1 text-xs">{planName} plan</div>
      </div>
      <SignOut />
    </div>
  );
  return (
    <>
      <aside className="border-border bg-subtle sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r p-4 lg:flex">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="VaultDrop home" className="rounded-md">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <Button asChild size="sm">
          <Link href="/#share">New secret</Link>
        </Button>
        <div className="flex-1 overflow-y-auto">
          <NavList isAdmin={isAdmin} unread={unread} />
        </div>
        {account}
      </aside>
      <header className="border-border bg-background/90 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur lg:hidden">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open dashboard menu">
              <Menu />
            </Button>
          </DialogTrigger>
          <DialogContent className="top-0 left-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-4">
            <DialogTitle className="sr-only">Dashboard navigation</DialogTitle>
            <Logo />
            <NavList isAdmin={isAdmin} unread={unread} onNavigate={() => setOpen(false)} />
            {account}
          </DialogContent>
        </Dialog>
        <Link href="/" aria-label="VaultDrop home">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/#share">New secret</Link>
          </Button>
        </div>
      </header>
    </>
  );
}
