import "server-only";
import { passkey } from "@better-auth/passkey";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { dbHandle } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { planFor } from "@/server/entitlements";
import { env } from "@/server/env";

/** Argon2id (RFC 9106 / OWASP parameters) for account passwords. */
const ARGON2_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

function createAuth() {
  const appUrl = new URL(env().APP_URL);
  return betterAuth({
    appName: "VaultDrop",
    baseURL: env().APP_URL,
    secret: env().BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl.origin],
    database: drizzleAdapter(dbHandle(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
        passkey: schema.passkey,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hash(password, ARGON2_OPTS),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your VaultDrop password",
          text: `Someone (hopefully you) asked to reset the password for this VaultDrop account.\n\nReset it here: ${url}\n\nThe link expires in one hour. If you did not request this, you can ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Verify your email for VaultDrop",
          text: `Welcome to VaultDrop.\n\nConfirm your email address: ${url}\n\nThis link expires in 24 hours.`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
    },
    user: {
      deleteUser: { enabled: true },
    },
    rateLimit: {
      enabled: true,
      // Shared across instances (serverless): an in-memory limiter would reset per function.
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "vaultdrop",
      useSecureCookies: appUrl.protocol === "https:",
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      ipAddress: { ipAddressHeaders: env().TRUST_PROXY ? ["x-forwarded-for"] : [] },
    },
    plugins: [
      twoFactor({ issuer: "VaultDrop" }),
      passkey({ rpID: appUrl.hostname, rpName: "VaultDrop", origin: appUrl.origin }),
      organization({
        // Entitlement enforced server-side: only plans with `teams` may create organizations.
        allowUserToCreateOrganization: async (user) =>
          (await planFor({ userId: user.id })).limits.teams,
        creatorRole: "owner",
        membershipLimit: 500,
        sendInvitationEmail: async ({ email, organization: org, inviter, id }) => {
          await sendEmail({
            to: email,
            subject: `You're invited to ${org.name} on VaultDrop`,
            text: `${inviter.user.name} invited you to join ${org.name} on VaultDrop.\n\nAccept: ${env().APP_URL}/accept-invitation/${id}\n\nIf you weren't expecting this, ignore this email.`,
          });
        },
      }),
      admin({ adminRoles: ["admin"] }),
      nextCookies(),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const admins = env()
              .ADMIN_EMAILS.split(",")
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);
            return {
              data: { ...user, role: admins.includes(user.email.toLowerCase()) ? "admin" : "user" },
            };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

const globalForAuth = globalThis as unknown as { __vaultdropAuth?: Auth };

/** Lazily constructed so that importing this module (e.g. during `next build`) never touches the database. */
export function getAuth(): Auth {
  globalForAuth.__vaultdropAuth ??= createAuth();
  return globalForAuth.__vaultdropAuth;
}
