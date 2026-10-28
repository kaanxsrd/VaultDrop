import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Reads the newest dev-outbox email for an address (SMTP is not configured in E2E). */
async function latestEmailLink(to: string, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const lines = readFileSync(".data/outbox.log", "utf8").trim().split("\n").reverse();
      for (const line of lines) {
        const msg = JSON.parse(line) as { to: string; text: string };
        const m = msg.to === to ? pattern.exec(msg.text) : null;
        if (m) return m[0];
      }
    } catch {
      /* not written yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${to}`);
}

async function signUpAndVerify(page: Page, email: string, password = "correct-horse-battery") {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  const link = await latestEmailLink(email, /http\S+verify-email\S+/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/dashboard/);
}

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test("sign up, verify email, use the dashboard, and sign out", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop dashboard flow");
  const email = `user-${unique()}@e2e.test`;
  await signUpAndVerify(page, email);
  await expect(page.getByRole("heading", { name: /Welcome back, E2E/ })).toBeVisible();
  await expect(page.getByText("No secrets yet")).toBeVisible();

  // Create a labelled secret while signed in.
  await page.goto("/");
  await page.getByLabel("Secret", { exact: true }).fill("dashboard secret");
  await page.getByRole("button", { name: "Advanced options" }).click();
  await page.getByLabel("Private label").fill("e2e label");
  await page.getByRole("button", { name: "Create secret link" }).click();
  await expect(page.getByTestId("share-url")).toBeVisible();

  // It appears in the dashboard as metadata, can be searched and destroyed.
  await page.goto("/dashboard/secrets");
  await expect(page.getByText("e2e label", { exact: true })).toBeVisible();
  await page.getByLabel("Search by label").fill("no-such-label");
  await expect(page.getByText("No matching secrets")).toBeVisible();
  await page.getByLabel("Search by label").fill("e2e");
  await page.getByRole("button", { name: "Destroy e2e label" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Destroy" }).click();
  await expect(page.getByText("Secret destroyed")).toBeVisible();
  await page.getByRole("tab", { name: "Destroyed" }).click();
  await expect(page.getByText("e2e label", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("dashboard secret");

  // Free plan: API keys are gated with a clear explanation.
  await page.goto("/dashboard/api-keys");
  await expect(page.getByText("API access is available on Pro and above")).toBeVisible();

  // Sessions are listed with the current device marked.
  await page.goto("/dashboard/security");
  await expect(page.getByText("This device")).toBeVisible();

  // Sign out returns to the public site; the dashboard then requires sign-in.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign-in rejects a wrong password without revealing whether the account exists", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(`nobody-${unique()}@e2e.test`);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
});

test("password reset via emailed link", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  const email = `reset-${unique()}@e2e.test`;
  await signUpAndVerify(page, email);
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/a reset link is on its way/)).toBeVisible();
  const link = await latestEmailLink(email, /http\S+reset-password\S+/);
  await page.goto(link);
  await page.getByLabel("New password").fill("a-brand-new-passphrase");
  await page.getByLabel("Confirm password").fill("a-brand-new-passphrase");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("a-brand-new-passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("admin can assign a plan, unlocking API keys that work against the API", async ({
  page,
  isMobile,
  request,
}) => {
  test.skip(isMobile, "desktop only");
  // ADMIN_EMAILS=admin@e2e.test is set for the E2E server.
  const email = "admin@e2e.test";
  const password = "admin-passphrase-123";
  // Create the admin on a fresh database, or sign in if a reused server already has it.
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Admin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  const outcome = await Promise.race([
    page
      .getByText("Check your inbox")
      .waitFor()
      .then(() => "created" as const),
    page
      .getByText(/already exists/)
      .waitFor()
      .then(() => "exists" as const),
  ]);
  if (outcome === "created") {
    await page.goto(await latestEmailLink(email, /http\S+verify-email\S+/));
  } else {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await page.waitForURL(/\/dashboard/);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(email) });
  await row.getByLabel(`Plan for ${email}`).selectOption("pro");
  await row.getByRole("button", { name: "Set" }).click();
  await expect(row.getByLabel(`Plan for ${email}`)).toHaveValue("pro");

  await page.goto("/dashboard/api-keys");
  await page.getByRole("button", { name: "New API key" }).click();
  await page.getByLabel("Name").fill("e2e key");
  await page.getByRole("button", { name: "Create key" }).click();
  const token = await page.getByLabel("New API key").inputValue();
  expect(token).toMatch(/^vd_live_[A-Za-z0-9_-]{43}$/);

  const usage = await request.get("/api/v1/account/usage", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(usage.status()).toBe(200);
  expect((await usage.json()).plan).toBe("pro");
});

test("non-admins cannot reach the admin area", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  await signUpAndVerify(page, `plain-${unique()}@e2e.test`);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
});
