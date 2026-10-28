"use client";

import { Plus, Trash, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/dashboard/page-title";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/overlays";
import { Alert, Badge, Input, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { formatRelative } from "@/lib/utils";

const EVENTS = [
  "secret.created",
  "secret.viewed",
  "secret.consumed",
  "secret.revoked",
  "secret.expired",
];

export interface EndpointRow {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  consecutiveFailures: number;
  createdAt: string;
}
export interface DeliveryRow {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatusCode: number | null;
  createdAt: string;
}

export function WebhooksManager({
  endpoints,
  deliveries,
}: {
  endpoints: EndpointRow[];
  deliveries: DeliveryRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(EVENTS);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ secret: string }>("/api/v1/webhooks", {
      method: "POST",
      json: { url, events },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setSecret(res.data.secret);
    router.refresh();
  }

  async function remove(id: string) {
    const res = await apiFetch(`/api/v1/webhooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Endpoint deleted.", "success");
      router.refresh();
    } else toast(res.error.message, "error");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setSecret(null);
              setUrl("");
              setError(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus /> Add endpoint
            </Button>
          </DialogTrigger>
          <DialogContent>
            {secret ? (
              <>
                <DialogTitle>Signing secret</DialogTitle>
                <DialogDescription>
                  Use it to verify the VaultDrop-Signature header. It is shown only once.
                </DialogDescription>
                <Input
                  readOnly
                  value={secret}
                  className="font-mono text-xs"
                  aria-label="Signing secret"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="flex justify-end gap-2">
                  <CopyButton value={secret} label="Copy secret" />
                  <DialogClose asChild>
                    <Button variant="outline">Done</Button>
                  </DialogClose>
                </div>
              </>
            ) : (
              <form onSubmit={create} className="flex flex-col gap-4">
                <DialogTitle>Add a webhook endpoint</DialogTitle>
                <DialogDescription>
                  Events contain metadata only — never secret content or keys.
                </DialogDescription>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="wh-url">Endpoint URL</Label>
                  <Input
                    id="wh-url"
                    type="url"
                    required
                    placeholder="https://example.com/hooks/vaultdrop"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">Events</legend>
                  {EVENTS.map((ev) => (
                    <label key={ev} className="flex items-center gap-2.5 font-mono text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={events.includes(ev)}
                        onChange={(e) =>
                          setEvents((all) =>
                            e.target.checked ? [...all, ev] : all.filter((x) => x !== ev),
                          )
                        }
                      />
                      {ev}
                    </label>
                  ))}
                </fieldset>
                {error && (
                  <Alert variant="destructive">
                    <span>{error}</span>
                  </Alert>
                )}
                <Button type="submit" loading={busy} disabled={!url || events.length === 0}>
                  Add endpoint
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {endpoints.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No endpoints"
          description="Get notified when secrets are created, opened, destroyed or expire. Payloads are HMAC-signed."
        />
      ) : (
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          {endpoints.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm">{e.url}</span>
                  {e.enabled ? (
                    <Badge>Enabled</Badge>
                  ) : (
                    <Badge variant="destructive">Disabled</Badge>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {e.events.join(", ")}
                  {e.consecutiveFailures > 0 && ` · ${e.consecutiveFailures} consecutive failures`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete endpoint ${e.url}`}
                onClick={() => void remove(e.id)}
              >
                <Trash />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {deliveries.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Recent deliveries</h2>
          <ul className="divide-border border-border bg-card divide-y rounded-xl border text-sm">
            {deliveries.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-mono">{d.eventType}</span>
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  {d.lastStatusCode ?? "—"} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"} ·{" "}
                  {formatRelative(d.createdAt)}
                  <Badge
                    variant={
                      d.status === "succeeded"
                        ? "default"
                        : d.status === "dead"
                          ? "destructive"
                          : "neutral"
                    }
                  >
                    {d.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
