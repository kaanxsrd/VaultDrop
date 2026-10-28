import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme";

/** Distraction-free frame for recipient and receipt pages: no marketing nav, no external resources. */
export function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center justify-between">
        <Link href="/" aria-label="VaultDrop home" className="rounded-md">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main
        id="main"
        className="container-page flex flex-1 items-start justify-center pt-6 pb-16 sm:pt-12"
      >
        <div className="border-border bg-card shadow-lifted w-full max-w-xl rounded-2xl border p-5 sm:p-8">
          {children}
        </div>
      </main>
      <footer className="container-page text-muted-foreground pb-6 text-center text-xs">
        End-to-end encrypted with AES-256-GCM. VaultDrop cannot read your secrets. ·{" "}
        <Link href="/security" className="hover:text-foreground underline underline-offset-2">
          How it works
        </Link>
      </footer>
    </div>
  );
}
