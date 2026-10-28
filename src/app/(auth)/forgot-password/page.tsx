"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthCard, FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Alert, Input } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Always show the same confirmation, whether or not the account exists.
    await authClient
      .requestPasswordReset({ email, redirectTo: "/reset-password" })
      .catch(() => null);
    setBusy(false);
    setDone(true);
  }

  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new one."
      footer={
        <Link href="/sign-in" className="underline underline-offset-2">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <Alert variant="success">
          <span>
            If an account exists for {email}, a reset link is on its way. It expires in one hour.
          </span>
        </Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <Button type="submit" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
