"use client";

import { KeyRound, Plus, TriangleAlert } from "lucide-react";
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
  Select,
} from "@/components/ui/overlays";
import { Alert, Badge, Input, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, formatRelative } from "@/lib/utils";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  environment: "live" | "test";
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

const SCOPES = [
  { id: "secrets:create", label: "Create secrets" },
  { id: "secrets:read", label: "Read secret metadata" },
  { id: "secrets:burn", label: "Destroy secrets" },
  { id: "webhooks:manage", label: "Manage webhooks" },
];

export function ApiKeysManager({ initial }: { initial: ApiKeyRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>([
    "secrets:create",
    "secrets:read",
    "secrets:burn",
  ]);
  const [expires, setExpires] = useState("90");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ token: string }>("/api/v1/account/api-keys", {
      method: "POST",
      json: {
        name,
        environment,
        scopes,
        expiresInDays: expires === "never" ? undefined : Number(expires),
      },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setToken(res.data.token);
    router.refresh();
  }

  async function revoke(id: string) {
    const res = await apiFetch(`/api/v1/account/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("API key revoked. Requests using it now fail.", "success");
      router.refresh();
    } else toast(res.error.message, "error");
  }

  const closeDialog = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setToken(null);
      setName("");
      setError(null);
    }
  };

  const active = initial.filter((k) => !k.revokedAt);
  const revoked = initial.filter((k) => k.revokedAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={closeDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> New API key
            </Button>
          </DialogTrigger>
          <DialogContent>
            {token ? (
              <>
                <DialogTitle>Copy your API key</DialogTitle>
                <DialogDescription>
                  This is the only time it will be shown. We store only a hash of it.
                </DialogDescription>
                <Input
                  readOnly
                  value={token}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                  aria-label="New API key"
                />
                <Alert variant="warning">
                  <TriangleAlert />
                  <span>Store it in a secrets manager or CI secret, never in source code.</span>
                </Alert>
                <div className="flex justify-end gap-2">
                  <CopyButton value={token} label="Copy key" />
                  <DialogClose asChild>
                    <Button variant="outline">Done</Button>
                  </DialogClose>
                </div>
              </>
            ) : (
              <form onSubmit={create} className="flex flex-col gap-4">
                <DialogTitle>Create an API key</DialogTitle>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="key-name">Name</Label>
                  <Input
                    id="key-name"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. GitHub Actions deploy"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="key-env">Environment</Label>
                    <Select
                      id="key-env"
                      value={environment}
                      onValueChange={(v) => setEnvironment(v as "live" | "test")}
                      options={[
                        { value: "live", label: "Live" },
                        { value: "test", label: "Test" },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="key-exp">Expires</Label>
                    <Select
                      id="key-exp"
                      value={expires}
                      onValueChange={setExpires}
                      options={[
                        { value: "30", label: "30 days" },
                        { value: "90", label: "90 days" },
                        { value: "365", label: "1 year" },
                        { value: "never", label: "Never" },
                      ]}
                    />
                  </div>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">Scopes</legend>
                  {SCOPES.map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={scopes.includes(s.id)}
                        onChange={(e) =>
                          setScopes((all) =>
                            e.target.checked ? [...all, s.id] : all.filter((x) => x !== s.id),
                          )
                        }
                      />
                      {s.label}{" "}
                      <code className="text-muted-foreground ml-auto font-mono text-xs">
                        {s.id}
                      </code>
                    </label>
                  ))}
                </fieldset>
                {error && (
                  <Alert variant="destructive">
                    <span>{error}</span>
                  </Alert>
                )}
                <Button type="submit" loading={busy} disabled={!name.trim() || scopes.length === 0}>
                  Create key
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys"
          description="Create a key to use the REST API, CLI or CI integrations. Keys are hashed at rest and shown only once."
        />
      ) : (
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          {active.map((k) => (
            <li
              key={k.id}
              className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{k.name}</span>
                  <Badge variant={k.environment === "live" ? "default" : "warning"}>
                    {k.environment}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-0.5 font-mono text-xs">{k.prefix}…</div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {k.scopes.join(", ")} · created {formatDateTime(k.createdAt)} ·{" "}
                  {k.lastUsedAt ? `last used ${formatRelative(k.lastUsedAt)}` : "never used"}
                  {k.expiresAt && ` · expires ${formatRelative(k.expiresAt)}`}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void revoke(k.id)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {revoked.length > 0 && (
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">Revoked keys ({revoked.length})</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {revoked.map((k) => (
              <li key={k.id}>
                {k.name} <span className="font-mono text-xs">{k.prefix}…</span> — revoked{" "}
                {formatDateTime(k.revokedAt!)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
