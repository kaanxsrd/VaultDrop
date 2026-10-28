"use client";

import {
  Clock3,
  Eye,
  EyeOff,
  Flame,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Alert, Input, Label } from "@/components/ui/primitives";
import { apiFetch } from "@/lib/api-client";
import type { Envelope, KdfParams } from "@/lib/crypto/envelope";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { SecretUnavailable, type UnavailableReason } from "./secret-state";

export interface InitialStatus {
  state: "active" | "consumed" | "expired" | "revoked";
  requiresPassphrase: boolean;
  kdf: KdfParams | null;
  expiresAt: string | null;
  viewsRemaining: number;
}

type View =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unavailable"; reason: UnavailableReason }
  | { kind: "revealed"; plaintext: string; viewsRemaining: number }
  | { kind: "cleared" };

const LINK_KEY_RE = /^[A-Za-z0-9_-]{43}$/;

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function SecretReveal({ id, status }: { id: string; status: InitialStatus | null }) {
  const passId = useId();
  // The key lives only in the fragment, which browsers never send to the server. null = not yet hydrated.
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => null,
  );
  const linkKey = hash !== null && LINK_KEY_RE.test(hash.slice(1)) ? hash.slice(1) : null;
  const [override, setView] = useState<View | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<null | "deriving" | "opening">(null);
  const [error, setError] = useState<string | null>(null);
  const [masked, setMasked] = useState(false);

  const initial: View =
    hash === null
      ? { kind: "loading" }
      : !status
        ? { kind: "unavailable", reason: "not_found" }
        : status.state !== "active"
          ? { kind: "unavailable", reason: status.state }
          : !linkKey
            ? { kind: "unavailable", reason: "incomplete" }
            : { kind: "ready" };
  const view = override ?? initial;

  useEffect(() => {
    // Remove plaintext from the DOM when the page is hidden or navigated away from.
    const clear = () => setView((v) => (v?.kind === "revealed" ? { kind: "cleared" } : v));
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, []);

  async function reveal(e: React.FormEvent) {
    e.preventDefault();
    const key = linkKey;
    if (!status || !key || busy) return;
    if (status.requiresPassphrase && !passphrase)
      return setError("Enter the passphrase the sender gave you.");
    setError(null);

    const { deriveKeys, openEnvelope, DecryptionError } = await import("@/lib/crypto/envelope");
    setBusy("deriving");
    let keys: Awaited<ReturnType<typeof deriveKeys>>;
    try {
      keys = await deriveKeys(key, status.kdf, status.requiresPassphrase ? passphrase : undefined);
    } catch {
      setBusy(null);
      return setView({ kind: "unavailable", reason: "incomplete" });
    }

    setBusy("opening");
    const res = await apiFetch<{ envelope: Envelope; viewsRemaining: number }>(
      `/api/v1/secrets/${id}/redeem`,
      {
        method: "POST",
        json: { proof: keys.authProof },
      },
    );

    if (!res.ok) {
      setBusy(null);
      if (res.network) {
        return setError(
          "The connection dropped before we could confirm the result. Try again — if it then says the secret was already opened, ask the sender for a new link.",
        );
      }
      if (res.error.code === "invalid_proof") {
        const left = Number(res.error.details?.attemptsRemaining ?? 0);
        if (!status.requiresPassphrase)
          return setView({ kind: "unavailable", reason: "incomplete" });
        setPassphrase("");
        return setError(
          `Incorrect passphrase. The secret is still sealed. ${left} attempt${left === 1 ? "" : "s"} left before it is destroyed.`,
        );
      }
      if (res.error.code === "secret_unavailable") {
        const state = String(res.error.details?.state ?? "consumed");
        const locked = res.error.details?.reason === "attempts_exceeded";
        return setView({
          kind: "unavailable",
          reason: (locked ? "locked" : state) as UnavailableReason,
        });
      }
      if (res.status === 404) return setView({ kind: "unavailable", reason: "not_found" });
      return setError(res.error.message);
    }

    try {
      const plaintext = await openEnvelope(res.data.envelope, keys.encKey);
      setView({ kind: "revealed", plaintext, viewsRemaining: res.data.viewsRemaining });
      setPassphrase("");
      // The link is now spent; drop the key from the address bar and history entry.
      history.replaceState(null, "", window.location.pathname);
    } catch (err) {
      setError(
        err instanceof DecryptionError
          ? "The secret was retrieved but could not be decrypted — the link may have been altered. It has been consumed; ask the sender to share it again."
          : "Something went wrong while decrypting.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (view.kind === "loading") {
    return (
      <div
        className="bg-muted/60 h-56 animate-pulse rounded-xl"
        role="status"
        aria-label="Loading"
      />
    );
  }
  if (view.kind === "unavailable") return <SecretUnavailable reason={view.reason} />;

  if (view.kind === "cleared") {
    return (
      <div
        className="flex flex-col items-center gap-3 py-8 text-center"
        data-testid="state-cleared"
      >
        <ShieldCheck className="text-primary size-8" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Cleared from this screen</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          The secret has been removed from this page and destroyed on our servers. It cannot be
          opened again.
        </p>
      </div>
    );
  }

  if (view.kind === "revealed") {
    return (
      <div className="animate-rise flex flex-col gap-4" data-testid="secret-revealed">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Here&apos;s your secret</h1>
            <p className="text-muted-foreground text-sm">
              {view.viewsRemaining > 0
                ? `This link can be opened ${view.viewsRemaining} more time${view.viewsRemaining === 1 ? "" : "s"}.`
                : "It has been permanently deleted from VaultDrop. Copy it somewhere safe now."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMasked((m) => !m)}
            aria-pressed={masked}
          >
            {masked ? <Eye /> : <EyeOff />} {masked ? "Show" : "Hide"}
          </Button>
        </div>
        <div className="relative">
          {/* biome-ignore lint/a11y/useSemanticElements: <pre> preserves whitespace; role=region names the scroll area */}
          <pre
            // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard-focusable (WCAG 2.1.1)
            tabIndex={0}
            role="region"
            aria-label="Secret content"
            data-testid="secret-content"
            className={`border-border bg-subtle max-h-[60vh] min-h-28 overflow-auto rounded-lg border p-4 font-mono text-[13.5px] leading-relaxed break-words whitespace-pre-wrap transition-[filter] ${masked ? "blur-md select-none" : ""}`}
          >
            {view.plaintext}
          </pre>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={view.plaintext} label="Copy secret" />
          <Button type="button" variant="outline" onClick={() => setView({ kind: "cleared" })}>
            Done — clear from screen
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          VaultDrop can&apos;t prevent screenshots or copying. Store this in a password manager and
          clear your clipboard afterwards.
        </p>
      </div>
    );
  }

  const s = status!;
  return (
    <form onSubmit={reveal} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="bg-primary-soft text-primary-soft-foreground grid size-12 place-items-center rounded-full">
          <LockKeyhole className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Someone shared a secret with you</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          {s.viewsRemaining === 1
            ? "It can be viewed only once. After you reveal it, it is permanently destroyed — make sure you're ready to copy it."
            : `It can be viewed ${s.viewsRemaining} more times, then it is destroyed.`}
        </p>
      </div>

      <ul className="border-border bg-subtle grid gap-2 rounded-lg border p-3.5 text-sm">
        <li className="flex items-center gap-2.5">
          <Flame className="text-muted-foreground size-4 shrink-0" aria-hidden />
          {s.viewsRemaining === 1 ? "One-time link" : `${s.viewsRemaining} views remaining`}
        </li>
        {s.expiresAt && (
          <li className="flex items-center gap-2.5">
            <Clock3 className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span>
              Expires {formatRelative(s.expiresAt)}{" "}
              <span className="text-muted-foreground">· {formatDateTime(s.expiresAt)}</span>
            </span>
          </li>
        )}
        <li className="flex items-center gap-2.5">
          <ShieldCheck className="text-muted-foreground size-4 shrink-0" aria-hidden />
          Decrypted in your browser with the key in this link
        </li>
      </ul>

      {s.requiresPassphrase && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={passId} className="flex items-center gap-1.5">
            <KeyRound className="size-3.5" aria-hidden /> Passphrase
          </Label>
          <div className="relative">
            <Input
              id={passId}
              type={showPass ? "text" : "password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="off"
              autoFocus
              className="h-11 pr-10 font-mono"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${passId}-err` : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1"
              aria-label={showPass ? "Hide passphrase" : "Show passphrase"}
            >
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-muted-foreground text-[13px]">
            A wrong passphrase does not destroy the secret, but repeated failures will.
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" id={`${passId}-err`}>
          <TriangleAlert />
          <span>{error}</span>
        </Alert>
      )}

      <Button type="submit" size="lg" loading={busy !== null} data-testid="reveal-button">
        {busy === "deriving" ? "Deriving key…" : busy === "opening" ? "Opening…" : "Reveal secret"}
      </Button>
    </form>
  );
}
