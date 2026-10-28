import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only allow same-site relative redirects.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return <SignInForm next={safeNext} />;
}
