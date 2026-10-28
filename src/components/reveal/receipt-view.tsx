"use client";

import { Flame, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/overlays";
import { Alert, Badge, Skeleton } from "@/components/ui/primitives";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { SecretUnavailable } from "./secret-state";

export interface Receipt {
  id: string;
  state: "active" | "consumed" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  hasPassphrase: boolean;
  label: string | null;
  consumedAt: string | null;
  revokedAt: string | null;
}

export function StateBadge({ state }: { state: Receipt["state"] }) {
  const map = {
    active: { label: "Active", variant: "default" },
    consumed: { label: "Opened", variant: "neutral" },
    expired: { label: "Expired", variant: "warning" },
    revoked: { label: "Destroyed", variant: "destructive" },
  } as const;
  return <Badge variant={map[state].variant}>{map[state].label}</Badge>;
}

export function ReceiptView({ id }: { id: string }) {
  const tokenRef = useRef<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);

  const load = useCallback(async () => {
    if (!tokenRef.current) return;
    const res = await apiFetch<Receipt>(`/api/v1/secrets/${id}`, {
      headers: { "X-Receipt-Token": tokenRef.current },
    });
    if (res.ok) {
      setReceipt(res.data);
      setStatus("ready");
    } else if (res.status === 404) setStatus("missing");
    else {
      setError(res.error.message);
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    tokenRef.current = /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
    if (!tokenRef.current) setStatus("missing");
    else void load();
  }, [load]);

  async function burn() {
    if (!tokenRef.current) return;
    setBurning(true);
    const res = await apiFetch<{ state: Receipt["state"] }>(`/api/v1/secrets/${id}/burn`, {
      method: "POST",
      headers: { "X-Receipt-Token": tokenRef.current },
    });
    setBurning(false);
    if (res.ok) await load();
    else setError(res.error.message);
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading receipt">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="mt-2 h-32 w-full" />
      </div>
    );
  }
  if (status === "missing" || !receipt) {
    return status === "error" ? (
      <Alert variant="destructive">
        <span>{error}</span>
      </Alert>
    ) : (
      <SecretUnavailable reason="not_found" />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Secret receipt</h1>
          <p className="text-muted-foreground text-sm">
            Private to you. Shows status only — the content is never visible here.
          </p>
        </div>
        <StateBadge state={receipt.state} />
      </div>

      <dl className="border-border bg-subtle grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-4 text-sm">
        {receipt.label && (
          <>
            <dt className="text-muted-foreground">Label</dt>
            <dd className="font-medium">{receipt.label}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatDateTime(receipt.createdAt)}</dd>
        <dt className="text-muted-foreground">
          {receipt.state === "active" ? "Expires" : "Expiry"}
        </dt>
        <dd>
          {formatDateTime(receipt.expiresAt)}
          {receipt.state === "active" && (
            <span className="text-muted-foreground"> · {formatRelative(receipt.expiresAt)}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Views</dt>
        <dd className="tabular-nums">
          {receipt.viewCount} of {receipt.maxViews}
        </dd>
        <dt className="text-muted-foreground">Passphrase</dt>
        <dd>{receipt.hasPassphrase ? "Required" : "None"}</dd>
        {receipt.consumedAt && (
          <>
            <dt className="text-muted-foreground">Opened</dt>
            <dd>{formatDateTime(receipt.consumedAt)}</dd>
          </>
        )}
        {receipt.revokedAt && (
          <>
            <dt className="text-muted-foreground">Destroyed</dt>
            <dd>{formatDateTime(receipt.revokedAt)}</dd>
          </>
        )}
      </dl>

      {error && (
        <Alert variant="destructive">
          <span>{error}</span>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw /> Refresh
        </Button>
        {receipt.state === "active" && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" data-testid="burn-button">
                <Flame /> Destroy secret
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Destroy this secret now?</DialogTitle>
              <DialogDescription>
                The encrypted content is deleted immediately and the link stops working. This cannot
                be undone.
              </DialogDescription>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    variant="destructive"
                    loading={burning}
                    onClick={() => void burn()}
                    data-testid="confirm-burn"
                  >
                    Destroy
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
