import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/auth/session";
import { MobileNav } from "./mobile-nav";
import { MAIN_NAV } from "./nav-links";

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="border-border/70 bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur-md">
      <a
        href="#main"
        className="focus:bg-card focus:shadow-lifted sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center gap-6">
        <Link href="/" className="rounded-md" aria-label="VaultDrop home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {session ? (
            <Button asChild size="sm" className="hidden md:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <div className="hidden items-center gap-1.5 md:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/sign-up">Create account</Link>
              </Button>
            </div>
          )}
          <MobileNav signedIn={Boolean(session)} />
        </div>
      </div>
    </header>
  );
}
