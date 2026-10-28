"use client";

import {
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RotateCcw,
  Shield,
  WandSparkles,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, Switch, Tooltip } from "@/components/ui/overlays";
import { Alert, FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/primitives";
import { EXPIRY_PRESETS, LABEL_MAX_LENGTH, MIN_EXPIRY_SECONDS } from "@/config/plans";
import { apiFetch } from "@/lib/api-client";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { type CreatedShare, ShareResult } from "./share-result";
import { SECRET_TEMPLATES } from "./templates";

export interface ComposerLimits {
  maxCiphertextBytes: number;
  maxExpirySeconds: number;
  maxViews: number;
  labels: boolean;
}

type Phase = "idle" | "encrypting" | "sending";

const encoder = new TextEncoder();
const CUSTOM = "custom";
const UNITS = [
  { value: "60", label: "minutes" },
  { value: "3600", label: "hours" },
  { value: "86400", label: "days" },
];

/** Mirrors ciphertextLengthFor() without importing the crypto bundle up front. */
function ciphertextBytesFor(plainBytes: number) {
  return Math.max(Math.ceil((plainBytes + 4) / 256) * 256, 256) + 16;
}

export function SecretComposer({
  limits,
  signedIn,
}: {
  limits: ComposerLimits;
  signedIn: boolean;
}) {
  const ids = {
    text: useId(),
    expiry: useId(),
    pass: useId(),
    views: useId(),
    label: useId(),
    custom: useId(),
  };
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [expiry, setExpiry] = useState(String(86_400));
  const [customAmount, setCustomAmount] = useState("2");
  const [customUnit, setCustomUnit] = useState("3600");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [maxViews, setMaxViews] = useState("1");
  const [label, setLabel] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedShare | null>(null);

  const bytes = useMemo(() => encoder.encode(text).length, [text]);
  const cipherBytes = ciphertextBytesFor(bytes);
  const tooLarge = cipherBytes > limits.maxCiphertextBytes;
  const maxPlainBytes = limits.maxCiphertextBytes - 16 - 4;

  const expiryOptions = useMemo(
    () => [
      ...EXPIRY_PRESETS.filter((p) => p.seconds <= limits.maxExpirySeconds).map((p) => ({
        value: String(p.seconds),
        label: p.label,
      })),
      { value: CUSTOM, label: "Custom…" },
    ],
    [limits.maxExpirySeconds],
  );

  const expirySeconds =
    expiry === CUSTOM ? Math.round(Number(customAmount) * Number(customUnit)) : Number(expiry);
  const expiryInvalid =
    !Number.isFinite(expirySeconds) ||
    expirySeconds < MIN_EXPIRY_SECONDS ||
    expirySeconds > limits.maxExpirySeconds;

  // Auto-resize to the content (176–480px); an empty composer returns to its natural height.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (text) el.style.height = `${Math.min(Math.max(el.scrollHeight, 176), 480)}px`;
  }, [text]);

  // Never leave plaintext in memory longer than needed if the user navigates away.
  useEffect(() => {
    const clear = () => {
      setText("");
      setPassphrase("");
    };
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, []);

  const reset = () => {
    setText("");
    setPassphrase("");
    setLabel("");
    setError(null);
    textRef.current?.focus();
  };

  const applyTemplate = (body: string) => {
    if (text.trim() && !window.confirm("Replace the current text with this template?")) return;
    setText(body);
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      const firstGap = body.indexOf(": ") + 2;
      el.setSelectionRange(firstGap, firstGap);
    });
  };

  const generate = async () => {
    const { generatePassphrase } = await import("@/lib/crypto/passphrase");
    setPassphrase(generatePassphrase());
    setShowPassphrase(true);
  };

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (phase !== "idle") return;
    setError(null);
    if (!text.trim()) return setError("Write or paste the secret you want to share.");
    if (tooLarge)
      return setError(
        `This secret is larger than your plan allows (${formatBytes(maxPlainBytes)}).`,
      );
    if (expiryInvalid)
      return setError(
        `Choose an expiry between 1 minute and ${formatDuration(limits.maxExpirySeconds)}.`,
      );
    if (usePassphrase && passphrase.length < 4)
      return setError(
        "Use a passphrase of at least 4 characters, or turn passphrase protection off.",
      );

    setPhase("encrypting");
    let sealed: Awaited<ReturnType<typeof import("@/lib/crypto/envelope").sealSecret>>;
    try {
      const { sealSecret } = await import("@/lib/crypto/envelope");
      sealed = await sealSecret(text, { passphrase: usePassphrase ? passphrase : undefined });
    } catch {
      setPhase("idle");
      return setError("Your browser could not encrypt this secret. Nothing was sent.");
    }

    setPhase("sending");
    const res = await apiFetch<{
      id: string;
      expiresAt: string;
      maxViews: number;
      receiptToken: string;
    }>("/api/v1/secrets", {
      method: "POST",
      json: {
        envelope: sealed.envelope,
        kdf: sealed.kdf,
        verifier: sealed.verifier,
        expiresIn: expirySeconds,
        maxViews: Number(maxViews),
        label: label.trim() || undefined,
      },
    });
    setPhase("idle");

    if (!res.ok) {
      const retry = res.error.details?.retryAfter;
      setError(
        res.error.code === "rate_limited" && typeof retry === "number"
          ? `You're creating secrets quickly. Try again in ${retry} seconds.`
          : res.network
            ? "Couldn't reach VaultDrop. Your secret was not sent — check your connection and try again."
            : res.error.message,
      );
      return;
    }

    const origin = window.location.origin;
    setCreated({
      shareUrl: `${origin}/s/${res.data.id}#${sealed.linkKey}`,
      receiptUrl: `${origin}/receipt/${res.data.id}#${res.data.receiptToken}`,
      expiresAt: res.data.expiresAt,
      maxViews: res.data.maxViews,
      hasPassphrase: Boolean(sealed.kdf),
    });
    // Clear plaintext and passphrase from the composer immediately after success.
    setText("");
    setPassphrase("");
    setLabel("");
  }

  if (created) {
    return (
      <ShareResult
        share={created}
        onReset={() => {
          setCreated(null);
          requestAnimationFrame(() => textRef.current?.focus());
        }}
      />
    );
  }

  const busy = phase !== "idle";
  const viewOptions = Array.from({ length: Math.min(limits.maxViews, 10) }, (_, i) => ({
    value: String(i + 1),
    label: i === 0 ? "1 view (one-time)" : `${i + 1} views`,
  }));

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      aria-describedby={error ? `${ids.text}-error` : undefined}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={ids.text}>Secret</Label>
          <fieldset className="flex flex-wrap justify-end gap-1">
            <legend className="sr-only">Templates</legend>
            {SECRET_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.body)}
                className="border-border text-muted-foreground hover:border-input hover:text-foreground rounded-full border px-2.5 py-1 text-xs transition-colors"
              >
                {t.label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="relative">
          <Textarea
            id={ids.text}
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            placeholder="Paste a password, API key, private note…"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-1p-ignore
            data-lpignore="true"
            aria-invalid={tooLarge || undefined}
            className="bg-subtle/60 min-h-44 resize-none pb-9 font-mono text-[13.5px] leading-relaxed"
            disabled={busy}
          />
          <div className="text-muted-foreground pointer-events-none absolute right-3 bottom-2.5 left-3 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" aria-hidden /> Encrypted in your browser
            </span>
            <span
              className={cn("tabular-nums", tooLarge && "text-destructive font-medium")}
              aria-live="polite"
            >
              {text.length.toLocaleString()} chars · {formatBytes(bytes)} /{" "}
              {formatBytes(maxPlainBytes)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.expiry}>Expires after</Label>
          <Select
            id={ids.expiry}
            value={expiry}
            onValueChange={setExpiry}
            options={expiryOptions}
            disabled={busy}
          />
          {expiry === CUSTOM && (
            <div className="flex gap-2">
              <Input
                id={ids.custom}
                aria-label="Custom expiry amount"
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d.]/g, ""))}
                aria-invalid={expiryInvalid || undefined}
                className="w-24"
              />
              <Select
                aria-label="Custom expiry unit"
                value={customUnit}
                onValueChange={setCustomUnit}
                options={UNITS}
              />
            </div>
          )}
          {expiry === CUSTOM && expiryInvalid && (
            <FieldError>Between 1 minute and {formatDuration(limits.maxExpirySeconds)}.</FieldError>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex h-3.5 items-center justify-between">
            <Label htmlFor={ids.pass}>Passphrase</Label>
            <Switch
              checked={usePassphrase}
              onCheckedChange={setUsePassphrase}
              aria-label="Require a passphrase"
              disabled={busy}
            />
          </div>
          {usePassphrase ? (
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Input
                  id={ids.pass}
                  type={showPassphrase ? "text" : "password"}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Shared separately"
                  className="pr-9 font-mono"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase((v) => !v)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
                  aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                >
                  {showPassphrase ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Tooltip content="Generate a strong passphrase">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={generate}
                  aria-label="Generate a strong passphrase"
                  disabled={busy}
                >
                  <WandSparkles />
                </Button>
              </Tooltip>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setUsePassphrase(true)}
              className="border-input text-muted-foreground hover:border-ring hover:text-foreground flex h-10 items-center gap-2 rounded-lg border border-dashed px-3 text-left text-sm transition-colors"
            >
              <KeyRound className="size-4" aria-hidden /> Add a passphrase
            </button>
          )}
        </div>
      </div>

      <div className="border-border rounded-lg border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="composer-advanced"
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium"
        >
          Advanced options
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 transition-transform",
              advancedOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {advancedOpen && (
          <div
            id="composer-advanced"
            className="border-border grid gap-4 border-t p-3.5 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.views}>Views before destruction</Label>
              <Select
                id={ids.views}
                value={maxViews}
                onValueChange={setMaxViews}
                options={viewOptions}
                disabled={busy || limits.maxViews === 1}
              />
              <FieldHint>
                {limits.maxViews === 1
                  ? "Multi-view links are available on paid plans."
                  : "Each view counts once. The link dies after the last view."}
              </FieldHint>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.label}>Private label</Label>
              <Input
                id={ids.label}
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, LABEL_MAX_LENGTH))}
                placeholder={limits.labels ? "e.g. Staging DB for Sam" : "Sign in to use labels"}
                disabled={busy || !limits.labels}
                autoComplete="off"
              />
              <FieldHint>
                Visible only to you in your dashboard. Stored unencrypted — don&apos;t put secrets
                here.
              </FieldHint>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" id={`${ids.text}-error`}>
          <Shield />
          <span>{error}</span>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {signedIn ? "Saved to your dashboard as metadata only." : "No account needed."} The key
          never reaches our servers.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={reset}
            disabled={busy || (!text && !passphrase)}
            aria-label="Clear the composer"
          >
            <RotateCcw /> Clear
          </Button>
          <Button type="submit" size="lg" loading={busy} className="flex-1 sm:flex-none">
            {phase === "encrypting"
              ? "Encrypting…"
              : phase === "sending"
                ? "Creating link…"
                : "Create secret link"}
          </Button>
        </div>
      </div>
    </form>
  );
}
