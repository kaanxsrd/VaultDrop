"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/overlays";
import { MAIN_NAV } from "./nav-links";

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 left-0 max-h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none rounded-b-2xl border-x-0 border-t-0 p-4">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <Logo />
        <nav aria-label="Mobile" className="mt-2 flex flex-col">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="hover:bg-muted rounded-lg px-2 py-3 text-base font-medium"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-border grid grid-cols-2 gap-2 border-t pt-4">
          {signedIn ? (
            <Button asChild className="col-span-2">
              <Link href="/dashboard" onClick={() => setOpen(false)}>
                Dashboard
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline">
                <Link href="/sign-in" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button asChild>
                <Link href="/sign-up" onClick={() => setOpen(false)}>
                  Create account
                </Link>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
