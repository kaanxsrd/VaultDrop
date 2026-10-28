import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <LogoMark className="size-12" />
      <div>
        <p className="text-muted-foreground font-mono text-sm">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Nothing here — and nothing left behind
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          This page doesn&apos;t exist. If you followed a secret link, check that you copied all of
          it, including the part after “#”.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">Share a secret</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs">Documentation</Link>
        </Button>
      </div>
    </main>
  );
}
