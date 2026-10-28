"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Plugin callback runs outside React, so a full navigation is intended here.
        window.location.href = "/two-factor";
      },
    }),
    passkeyClient(),
    organizationClient(),
    adminClient(),
  ],
});

/** Maps Better Auth error codes to calm, specific copy. */
export function authErrorMessage(
  error: { code?: string; message?: string; status?: number } | null | undefined,
): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match an account.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email first — we've sent you a new link.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Try signing in.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 10 characters.";
    case "INVALID_TOKEN":
      return "This link is invalid or has expired. Request a new one.";
    case "INVALID_TWO_FACTOR_AUTHENTICATION":
    case "INVALID_CODE":
      return "That code isn't valid. Check your authenticator and try again.";
    default:
      return error.message ?? "Something went wrong. Please try again.";
  }
}
