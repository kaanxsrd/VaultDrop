"use client";

import { KeyRound, Laptop, ShieldCheck, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { formatDateTime, formatRelative } from "@/lib/utils";

interface SessionRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export function SecurityPanels({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <PasswordPanel />
      <TwoFactorPanel enabled={twoFactorEnabled} />
      <PasskeysPanel />
      <SessionsPanel />
    </div>
  );
}

function PasswordPanel() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 10) return setError("Use at least 10 characters.");
    setBusy(true);
    setError(null);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setCurrent("");
    setNext("");
    toast("Password changed. Other sessions were signed out.", "success");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs out your other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cur-pw">Current password</Label>
            <Input
              id="cur-pw"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <Button type="submit" loading={busy} disabled={!current || !next}>
            Update
          </Button>
        </form>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <span>{error}</span>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ qr: string; uri: string; backupCodes: string[] } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error || !data) return setError(authErrorMessage(error));
    if (data.method !== "totp") return setError("Authenticator-app setup is not available.");
    const QR = await import("qrcode");
    const svg = await QR.toString(data.totpURI, {
      type: "svg",
      margin: 1,
      color: { dark: "#0d1117", light: "#ffffff" },
    });
    setSetup({
      qr: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      uri: data.totpURI,
      backupCodes: data.backupCodes,
    });
    setPassword("");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setSetup(null);
    router.refresh();
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setPassword("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Two-factor authentication</CardTitle>
          {enabled ? (
            <Badge>
              <ShieldCheck /> On
            </Badge>
          ) : (
            <Badge variant="neutral">Off</Badge>
          )}
        </div>
        <CardDescription>
          Require a code from an authenticator app when signing in with a password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {setup ? (
          <form onSubmit={verify} className="grid gap-5 sm:grid-cols-[auto_1fr]">
            {/* biome-ignore lint/performance/noImgElement: locally generated data: URI that next/image cannot optimise */}
            <img
              src={setup.qr}
              alt="Authenticator setup QR code"
              className="border-border size-40 rounded-lg border bg-white p-1.5"
            />
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Scan with your authenticator app, then enter the 6-digit code to finish.
              </p>
              <div className="flex gap-2">
                <Input
                  aria-label="Verification code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-36 font-mono"
                />
                <Button type="submit" loading={busy}>
                  Verify & enable
                </Button>
              </div>
              <div className="border-border bg-subtle rounded-lg border p-3">
                <div className="mb-2 text-sm font-medium">Backup codes</div>
                <p className="text-muted-foreground mb-2 text-xs">
                  Each works once if you lose your device. Save them somewhere safe now.
                </p>
                <code className="grid grid-cols-2 gap-1 font-mono text-xs">
                  {setup.backupCodes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </code>
                <CopyButton
                  value={setup.backupCodes.join("\n")}
                  label="Copy codes"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                />
              </div>
            </div>
          </form>
        ) : (
          <form
            onSubmit={enabled ? disable : start}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="tf-pw">Confirm with your password</Label>
              <Input
                id="tf-pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant={enabled ? "outline" : "default"}
              loading={busy}
              disabled={!password}
            >
              {enabled ? "Turn off" : "Set up"}
            </Button>
          </form>
        )}
        {error && (
          <Alert variant="destructive">
            <span>{error}</span>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function PasskeysPanel() {
  const toast = useToast();
  const { data: passkeys, isPending, refetch } = authClient.useListPasskeys();
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const res = await authClient.passkey.addPasskey({ name: describeAgent(navigator.userAgent) });
    setBusy(false);
    if (res?.error) toast(authErrorMessage(res.error), "error");
    else {
      toast("Passkey added.", "success");
      refetch();
    }
  }
  async function remove(id: string) {
    const { error } = await authClient.passkey.deletePasskey({ id });
    if (error) toast(authErrorMessage(error), "error");
    else refetch();
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Passkeys</CardTitle>
            <CardDescription className="mt-1.5">
              Phishing-resistant sign-in with your device&apos;s biometrics or security key.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void add()} loading={busy}>
            <KeyRound /> Add passkey
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : !passkeys || passkeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">No passkeys yet.</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span>
                  {p.name ?? "Passkey"}{" "}
                  <span className="text-muted-foreground">
                    · added {p.createdAt ? formatDateTime(p.createdAt) : "—"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove passkey ${p.name ?? ""}`}
                  onClick={() => void remove(p.id)}
                >
                  <Trash />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SessionsPanel() {
  const toast = useToast();
  const [items, setItems] = useState<SessionRow[] | null>(null);
  const [nonce, setNonce] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce is a refetch trigger
  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ items: SessionRow[] }>("/api/v1/account/sessions").then((res) => {
      if (!cancelled && res.ok) setItems(res.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  const reload = () => setNonce((n) => n + 1);

  async function revoke(id: string) {
    const res = await apiFetch(`/api/v1/account/sessions/${id}`, { method: "DELETE" });
    if (res.ok) reload();
    else toast(res.error.message, "error");
  }
  async function revokeOthers() {
    const res = await apiFetch<{ revoked: number }>("/api/v1/account/sessions", { method: "POST" });
    if (res.ok) {
      toast(
        `Signed out ${res.data.revoked} other session${res.data.revoked === 1 ? "" : "s"}.`,
        "success",
      );
      reload();
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription className="mt-1.5">
              Devices currently signed in to your account.
            </CardDescription>
          </div>
          {items && items.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => void revokeOthers()}>
              Sign out others
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!items ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border">
            {items.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2.5">
                  <Laptop className="text-muted-foreground size-4" aria-hidden />
                  <span>
                    {describeAgent(s.userAgent)}{" "}
                    {s.current && <Badge className="ml-1">This device</Badge>}
                    <span className="text-muted-foreground block text-xs">
                      {s.ipAddress ?? "IP not recorded"} · active {formatRelative(s.updatedAt)}
                    </span>
                  </span>
                </span>
                {!s.current && (
                  <Button variant="ghost" size="sm" onClick={() => void revoke(s.id)}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
