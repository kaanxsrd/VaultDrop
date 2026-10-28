"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/** Branded error / temporarily-unavailable state. Never renders error details (they may be sensitive). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <LogoMark className="size-12" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          VaultDrop is temporarily unavailable
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Something went wrong on our side. No secret was opened or destroyed by this error. Try
          again in a moment.
        </p>
        {error.digest && (
          <p className="text-muted-foreground mt-3 font-mono text-xs">Reference: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/status">Check status</Link>
        </Button>
      </div>
    </main>
  );
}
