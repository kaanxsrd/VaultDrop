import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { FOOTER_NAV } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="border-border bg-subtle mt-24 border-t">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="text-muted-foreground mt-3 max-w-xs text-sm">
            Share secrets. Leave no trace. Encrypted in your browser, opened once, then gone.
          </p>
        </div>
        {FOOTER_NAV.map((group) => (
          <div key={group.title}>
            <h2 className="text-sm font-semibold">{group.title}</h2>
            <ul className="mt-3 space-y-2">
              {group.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-border border-t">
        <div className="container-page text-muted-foreground flex flex-col gap-2 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} VaultDrop. All rights reserved.</p>
          <p>No third-party trackers. No ads.</p>
        </div>
      </div>
    </footer>
  );
}
