/**
 * Single source of truth for plans, prices and limits. Everything that enforces a limit reads it
 * through `src/server/entitlements.ts`; the pricing page renders from the same data.
 * Prices are configuration, not commitments: adjust them here (or wire Stripe prices via env).
 */

export type PlanId = "anonymous" | "free" | "personal" | "pro" | "team" | "enterprise";

export interface PlanLimits {
  /** Maximum ciphertext size in bytes (plaintext is padded to 256-byte buckets + 16-byte tag). */
  maxCiphertextBytes: number;
  maxExpirySeconds: number;
  maxViews: number;
  /** Secrets created per calendar month (UTC). null = unlimited (rate limits still apply). */
  secretsPerMonth: number | null;
  /** Requests per minute for authenticated API usage. */
  apiRequestsPerMinute: number;
  apiAccess: boolean;
  webhooks: boolean;
  labels: boolean;
  teams: boolean;
  branding: boolean;
  sso: boolean;
  maxApiKeys: number;
  maxWebhookEndpoints: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price in USD, or null for "contact us". */
  priceMonthly: number | null;
  perSeat?: boolean;
  /** Purchasable via self-serve checkout. */
  selfServe: boolean;
  highlights: string[];
  limits: PlanLimits;
}

const KiB = 1024;
const HOUR = 3600;
const DAY = 24 * HOUR;

export const PLANS: Record<PlanId, Plan> = {
  anonymous: {
    id: "anonymous",
    name: "Anonymous",
    tagline: "No account needed.",
    priceMonthly: 0,
    selfServe: false,
    highlights: [],
    limits: {
      maxCiphertextBytes: 16 * KiB + 16,
      maxExpirySeconds: 7 * DAY,
      maxViews: 1,
      secretsPerMonth: null,
      apiRequestsPerMinute: 0,
      apiAccess: false,
      webhooks: false,
      labels: false,
      teams: false,
      branding: false,
      sso: false,
      maxApiKeys: 0,
      maxWebhookEndpoints: 0,
    },
  },
  free: {
    id: "free",
    name: "Free",
    tagline: "Everything you need to share safely.",
    priceMonthly: 0,
    selfServe: true,
    highlights: [
      "Unlimited one-time secrets (rate limited)",
      "Expiry up to 7 days",
      "Passphrase protection",
      "Client-side AES-256-GCM encryption",
      "Revoke links before they are read",
    ],
    limits: {
      maxCiphertextBytes: 16 * KiB + 16,
      maxExpirySeconds: 7 * DAY,
      maxViews: 1,
      secretsPerMonth: 300,
      apiRequestsPerMinute: 0,
      apiAccess: false,
      webhooks: false,
      labels: true,
      teams: false,
      branding: false,
      sso: false,
      maxApiKeys: 0,
      maxWebhookEndpoints: 0,
    },
  },
  personal: {
    id: "personal",
    name: "Personal",
    tagline: "More room for everyday sharing.",
    priceMonthly: 4,
    selfServe: true,
    highlights: [
      "Everything in Free",
      "Expiry up to 30 days",
      "Multi-view links (up to 5 views)",
      "64 KiB secrets",
      "Read notifications",
    ],
    limits: {
      maxCiphertextBytes: 64 * KiB + 16,
      maxExpirySeconds: 30 * DAY,
      maxViews: 5,
      secretsPerMonth: 2_000,
      apiRequestsPerMinute: 0,
      apiAccess: false,
      webhooks: false,
      labels: true,
      teams: false,
      branding: false,
      sso: false,
      maxApiKeys: 0,
      maxWebhookEndpoints: 0,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For developers and automation.",
    priceMonthly: 12,
    selfServe: true,
    highlights: [
      "Everything in Personal",
      "REST API, CLI and SDK access",
      "Signed webhooks",
      "256 KiB secrets, up to 10 views",
      "Separate live and test credentials",
    ],
    limits: {
      maxCiphertextBytes: 256 * KiB + 16,
      maxExpirySeconds: 30 * DAY,
      maxViews: 10,
      secretsPerMonth: 20_000,
      apiRequestsPerMinute: 120,
      apiAccess: true,
      webhooks: true,
      labels: true,
      teams: false,
      branding: false,
      sso: false,
      maxApiKeys: 10,
      maxWebhookEndpoints: 5,
    },
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "Shared workspaces with central control.",
    priceMonthly: 9,
    perSeat: true,
    selfServe: true,
    highlights: [
      "Everything in Pro",
      "Organizations and invitations",
      "Role-based access control",
      "Metadata-only audit log",
      "Custom branding on share pages",
    ],
    limits: {
      maxCiphertextBytes: 256 * KiB + 16,
      maxExpirySeconds: 90 * DAY,
      maxViews: 25,
      secretsPerMonth: 100_000,
      apiRequestsPerMinute: 300,
      apiAccess: true,
      webhooks: true,
      labels: true,
      teams: true,
      branding: true,
      sso: false,
      maxApiKeys: 50,
      maxWebhookEndpoints: 20,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For regulated and large organizations.",
    priceMonthly: null,
    selfServe: false,
    highlights: [
      "Everything in Team",
      "SSO (OIDC/SAML) — on the roadmap",
      "Custom limits and policies",
      "Self-hosting support",
      "Priority support",
    ],
    limits: {
      maxCiphertextBytes: 1024 * KiB + 16,
      maxExpirySeconds: 90 * DAY,
      maxViews: 100,
      secretsPerMonth: null,
      apiRequestsPerMinute: 1_000,
      apiAccess: true,
      webhooks: true,
      labels: true,
      teams: true,
      branding: true,
      sso: true,
      maxApiKeys: 200,
      maxWebhookEndpoints: 100,
    },
  },
};

export const PUBLIC_PLANS: PlanId[] = ["free", "personal", "pro", "team", "enterprise"];

/** Expiry presets offered in the composer; filtered by the plan's maxExpirySeconds. */
export const EXPIRY_PRESETS = [
  { label: "5 minutes", seconds: 5 * 60 },
  { label: "15 minutes", seconds: 15 * 60 },
  { label: "1 hour", seconds: HOUR },
  { label: "24 hours", seconds: DAY },
  { label: "7 days", seconds: 7 * DAY },
  { label: "30 days", seconds: 30 * DAY },
] as const;

export const MIN_EXPIRY_SECONDS = 60;
export const DEFAULT_EXPIRY_SECONDS = DAY;
export const DEFAULT_MAX_FAILED_ATTEMPTS = 10;
export const LABEL_MAX_LENGTH = 80;
