"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Alert, Input } from "@/components/ui/primitives";
import { authClient, authErrorMessage } from "@/lib/auth-client";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") ? "This reset link is invalid or has expired." : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return setError("This reset link is invalid or has expired.");
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    router.push("/sign-in?reset=1");
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="All other sessions will be signed out."
      footer={
        <Link href="/forgot-password" className="underline underline-offset-2">
          Request a new link
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="New password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </FormField>
        {error && (
          <Alert variant="destructive">
            <span>{error}</span>
          </Alert>
        )}
        <Button type="submit" loading={busy}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
