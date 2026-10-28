"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard, FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Alert, Input, Separator } from "@/components/ui/primitives";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const { data, error } = await authClient.signIn.email({ ...values, callbackURL: next });
    if (error) return setError(authErrorMessage(error));
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return; // handled by plugin redirect
    router.push(next);
    router.refresh();
  });

  const passkey = async () => {
    setError(null);
    setPasskeyBusy(true);
    const res = await authClient.signIn.passkey();
    setPasskeyBusy(false);
    if (res?.error) return setError(authErrorMessage(res.error));
    router.push(next);
    router.refresh();
  };

  return (
    <AuthCard
      title="Sign in to VaultDrop"
      description="Manage your secrets, API keys and team."
      footer={
        <>
          New here?{" "}
          <Link
            href="/sign-up"
            className="text-foreground font-medium underline underline-offset-2"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email webauthn"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </FormField>
        <FormField
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          aside={
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-[13px]"
            >
              Forgot password?
            </Link>
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </FormField>
        {error && (
          <Alert variant="destructive">
            <span>{error}</span>
          </Alert>
        )}
        <Button type="submit" loading={isSubmitting} className="mt-1">
          Sign in
        </Button>
      </form>
      <div className="text-muted-foreground my-5 flex items-center gap-3 text-xs">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={passkey}
        loading={passkeyBusy}
      >
        <KeyRound /> Sign in with a passkey
      </Button>
    </AuthCard>
  );
}
