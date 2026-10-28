import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-subtle flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center justify-between">
        <Link href="/" aria-label="VaultDrop home" className="rounded-md">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main
        id="main"
        className="container-page flex flex-1 items-start justify-center pt-6 pb-16 sm:pt-14"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="container-page text-muted-foreground pb-6 text-center text-xs">
        Accounts are optional. You can always{" "}
        <Link href="/" className="hover:text-foreground underline underline-offset-2">
          share a secret anonymously
        </Link>
        .
      </footer>
    </div>
  );
}
