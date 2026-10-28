"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Alert, Input } from "@/components/ui/primitives";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export default function TwoFactorPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({
            code: code.replace(/\s/g, ""),
            trustDevice: trust,
          })
        : await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: trust });
    setBusy(false);
    if (res.error) return setError(authErrorMessage(res.error));
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthCard
      title="Two-factor authentication"
      description={
        mode === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of your saved backup codes."
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField label={mode === "totp" ? "Authentication code" : "Backup code"} htmlFor="code">
          <Input
            id="code"
            inputMode={mode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-11 text-center font-mono text-lg tracking-[0.3em]"
          />
        </FormField>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Trust this device for 30 days
        </label>
        {error && (
          <Alert variant="destructive">
            <span>{error}</span>
          </Alert>
        )}
        <Button type="submit" loading={busy}>
          Verify
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => setMode(mode === "totp" ? "backup" : "totp")}
          className="self-center"
        >
          {mode === "totp" ? "Use a backup code instead" : "Use authenticator app"}
        </Button>
      </form>
    </AuthCard>
  );
}
