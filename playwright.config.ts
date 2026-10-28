import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// Fresh throwaway secrets per run; never reuse real ones in tests.
const ephemeral = () => randomBytes(32).toString("base64url");

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E runs against a production build (`bun run build` first) backed by a throwaway embedded database.
 * TRUST_PROXY is enabled so each test can present its own client IP via X-Forwarded-For and exercise
 * the real rate limiter without tests interfering with each other.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive|secret-flow/ },
  ],
  webServer: {
    command: `bun -e "const fs=require('fs');fs.rmSync('.data/e2e',{recursive:true,force:true});fs.rmSync('.data/outbox.log',{force:true})" && bun --bun next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_URL: BASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? ephemeral(),
      APP_SECRET: process.env.APP_SECRET ?? ephemeral(),
      VAULTDROP_ALLOW_EMBEDDED_DB: "1",
      PGLITE_DATA_DIR: ".data/e2e",
      TRUST_PROXY: "true",
      JOBS_IN_PROCESS: "false",
      LOG_LEVEL: "warn",
      ADMIN_EMAILS: "admin@e2e.test",
      EMAIL_OUTBOX_FILE: ".data/outbox.log",
      // Never let the test server pick up real services from an env file it might load.
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      REDIS_URL: "",
      SMTP_URL: "",
      SMTP_HOST: "",
      STRIPE_SECRET_KEY: "",
    },
  },
});
