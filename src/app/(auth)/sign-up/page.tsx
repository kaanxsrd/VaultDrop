"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard, FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Alert, Input } from "@/components/ui/primitives";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us what to call you.").max(80),
  email: z.email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters.").max(256),
});
type Values = z.infer<typeof schema>;

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const { error } = await authClient.signUp.email({ ...values, callbackURL: "/dashboard" });
    if (error) return setError(authErrorMessage(error));
    setSentTo(values.email);
  });

  if (sentTo) {
    return (
      <AuthCard
        title="Check your inbox"
        description={
          <>
            We sent a verification link to <strong className="text-foreground">{sentTo}</strong>. It
            expires in 24 hours.
          </>
        }
      >
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-2 text-center text-sm">
          <MailCheck className="text-primary size-10" aria-hidden />
          <p>Click the link to activate your account. You can close this tab.</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Optional — anonymous sharing stays free. Accounts add a dashboard, labels and API access."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-foreground font-medium underline underline-offset-2"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField label="Name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
        </FormField>
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </FormField>
        <FormField
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          hint="At least 10 characters. A passphrase works well."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
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
          Create account
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
