import "server-only";
import { z } from "zod";

const DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  /** Postgres connection string. When unset, an embedded PGlite database is used (dev/test only). */
  DATABASE_URL: z.string().optional(),
  /** Direct (non-pooled) connection for migrations, e.g. Neon's host without "-pooler". */
  DATABASE_URL_UNPOOLED: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),
  REDIS_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Separate key for VaultDrop's own HMACs (receipt tokens) and webhook-secret encryption. */
  APP_SECRET: z.string().min(32).optional(),
  /** Either SMTP_URL, or the discrete SMTP_HOST/PORT/SECURE/USER/PASS settings below. */
  SMTP_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /** true = implicit TLS (port 465). false = STARTTLS, which is then required (port 587). */
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("VaultDrop <no-reply@vaultdrop.local>"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PERSONAL: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  CRON_SECRET: z.string().min(24).optional(),
  /** Run cleanup/webhook jobs inside the web process. Disable when running a dedicated worker. */
  JOBS_IN_PROCESS: bool.default(true),
  /** Trust X-Forwarded-For from a reverse proxy. Only enable behind a proxy that overwrites it. */
  TRUST_PROXY: bool.default(false),
  ADMIN_EMAILS: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  STATUS_PAGE_URL: z.url().optional(),
  SUPPORT_EMAIL: z.string().default("support@vaultdrop.local"),
  SECURITY_EMAIL: z.string().default("security@vaultdrop.local"),
});

export type Env = z.infer<typeof schema> & { BETTER_AUTH_SECRET: string; APP_SECRET: string };

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const env = parsed.data;
  const isProd =
    env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
  if (isProd) {
    const embedded = process.env.VAULTDROP_ALLOW_EMBEDDED_DB === "1";
    const required = embedded
      ? (["BETTER_AUTH_SECRET", "APP_SECRET"] as const)
      : (["BETTER_AUTH_SECRET", "APP_SECRET", "DATABASE_URL"] as const);
    const missing = required.filter((k) => !env[k]);
    if (missing.length)
      throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
    // Secure cookies, HSTS and passkeys all require the real public https origin.
    const appUrl = new URL(env.APP_URL);
    if (!embedded && (appUrl.protocol !== "https:" || appUrl.hostname === "localhost")) {
      throw new Error("APP_URL must be the public https:// origin in production.");
    }
  }
  return {
    ...env,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? DEV_SECRET,
    APP_SECRET: env.APP_SECRET ?? `${DEV_SECRET}-app`,
  };
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= load();
  return cached;
}

export const isTest = () => process.env.VAULTDROP_TEST === "1";
