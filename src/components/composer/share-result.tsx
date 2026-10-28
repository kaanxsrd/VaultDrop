"use client";

import {
  CircleCheck,
  Clock3,
  Eye,
  KeyRound,
  Plus,
  QrCode,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/overlays";
import { Alert, Input, Label } from "@/components/ui/primitives";
import { formatDateTime, formatRelative } from "@/lib/utils";

export interface CreatedShare {
  shareUrl: string;
  receiptUrl: string;
  expiresAt: string;
  maxViews: number;
  hasPassphrase: boolean;
}

function QrDialog({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || svg) return;
    let cancelled = false;
    void import("qrcode").then((QR) =>
      QR.toString(value, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        color: { dark: "#0d1117", light: "#ffffff" },
      }).then((s) => {
        if (!cancelled) setSvg(s);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [open, svg, value]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <QrCode /> QR code
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogTitle>Scan to open</DialogTitle>
        <DialogDescription>
          The QR code contains the full link, including the decryption key. Treat it like the link
          itself.
        </DialogDescription>
        <div className="border-border mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-lg border bg-white p-2">
          {svg ? (
            // biome-ignore lint/performance/noImgElement: SVG from the local qrcode library as a data: URI, which next/image cannot optimise
            <img
              alt="QR code for the secret link"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
              className="size-full"
            />
          ) : (
            <div className="bg-muted size-full animate-pulse rounded" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const noopSubscribe = () => () => {};

export function ShareResult({ share, onReset }: { share: CreatedShare; onReset: () => void }) {
  const canShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );

  return (
    <div className="animate-rise flex flex-col gap-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="bg-primary-soft text-primary-soft-foreground grid size-9 shrink-0 place-items-center rounded-full">
          <CircleCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your secret link is ready</h2>
          <p className="text-muted-foreground text-sm">
            The secret has been cleared from this page. Only this link can open it.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="share-url">Share link</Label>
        <Input
          id="share-url"
          readOnly
          value={share.shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="bg-subtle h-11 font-mono text-[13px]"
          data-testid="share-url"
        />
        <div className="flex flex-wrap gap-2">
          <CopyButton value={share.shareUrl} label="Copy link" className="flex-1 sm:flex-none" />
          <QrDialog value={share.shareUrl} />
          {canShare && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void navigator
                  .share({ title: "A secret for you", url: share.shareUrl })
                  .catch(() => {})
              }
            >
              <Share2 /> Share
            </Button>
          )}
        </div>
      </div>

      <ul className="border-border bg-subtle grid gap-2.5 rounded-lg border p-4 text-sm">
        <li className="flex gap-2.5">
          <Eye className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {share.maxViews === 1
              ? "Can be opened exactly once"
              : `Can be opened ${share.maxViews} times`}
            , then it is permanently destroyed.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Clock3 className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Expires {formatRelative(share.expiresAt)}{" "}
            <span className="text-muted-foreground">({formatDateTime(share.expiresAt)})</span> if
            unopened.
          </span>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <span>The decryption key is the part after “#”. It never reaches our servers.</span>
        </li>
      </ul>

      {share.hasPassphrase && (
        <Alert variant="warning">
          <KeyRound />
          <span>
            Send the passphrase through a different channel than the link — for example, read it out
            on a call.
          </span>
        </Alert>
      )}

      <div className="border-border flex flex-col gap-2 rounded-lg border p-4">
        <div className="text-sm font-medium">Private receipt</div>
        <p className="text-muted-foreground text-sm">
          Keep this link for yourself to see whether the secret was opened, or to destroy it before
          it is read. Don&apos;t send it to the recipient.
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton
            value={share.receiptUrl}
            label="Copy receipt link"
            variant="outline"
            size="sm"
          />
          <Button asChild variant="ghost" size="sm">
            <a href={share.receiptUrl} target="_blank" rel="noopener noreferrer">
              Open receipt
            </a>
          </Button>
        </div>
      </div>

      <Button type="button" variant="secondary" onClick={onReset} className="self-start">
        <Plus /> Share another secret
      </Button>
    </div>
  );
}
