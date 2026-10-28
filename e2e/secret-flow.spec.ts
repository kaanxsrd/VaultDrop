import { createSecretViaUi, expect, test } from "./fixtures";

const SECRET = "db-password: c0rrect-h0rse-battery-staple 🔐";

test("creates a secret, opens it exactly once, and clears the composer", async ({
  page,
  browser,
}) => {
  const { shareUrl } = await createSecretViaUi(page, SECRET);
  expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{22}#[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText("Your secret link is ready")).toBeVisible();

  // Composer returns empty: plaintext is not kept after success.
  await page.getByRole("button", { name: "Share another secret" }).click();
  await expect(page.getByLabel("Secret", { exact: true })).toHaveValue("");

  // Recipient in a separate browser context.
  const recipient = await browser.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": "10.200.1.1" },
  });
  const rp = await recipient.newPage();
  await rp.goto(shareUrl);
  await expect(rp.getByRole("heading", { name: "Someone shared a secret with you" })).toBeVisible();
  await rp.getByTestId("reveal-button").click();
  await expect(rp.getByTestId("secret-content")).toHaveText(SECRET);
  // Key is stripped from the address bar after reveal.
  expect(new URL(rp.url()).hash).toBe("");

  // Second visit with the full link: consumed.
  const again = await recipient.newPage();
  await again.goto(shareUrl);
  await expect(again.getByTestId("state-consumed")).toBeVisible();
  await recipient.close();
});

test("wrong passphrase does not consume; right passphrase reveals", async ({ page }) => {
  const { shareUrl } = await createSecretViaUi(page, SECRET, { passphrase: "orchid-lantern-42" });
  await expect(page.getByText(/Send the passphrase through a different channel/)).toBeVisible();

  await page.goto(shareUrl);
  const pass = page.getByLabel("Passphrase", { exact: true });
  await pass.fill("wrong-guess");
  await page.getByTestId("reveal-button").click();
  await expect(
    page.getByText(/Incorrect passphrase\. The secret is still sealed\. 9 attempts left/),
  ).toBeVisible();

  await pass.fill("orchid-lantern-42");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("secret-content")).toHaveText(SECRET);
});

test("a link without its key fragment is reported as incomplete and not consumed", async ({
  page,
}) => {
  const { shareUrl } = await createSecretViaUi(page, SECRET);
  const [withoutKey = ""] = shareUrl.split("#");
  await page.goto(withoutKey);
  await expect(page.getByTestId("state-incomplete")).toBeVisible();
  // The secret is still intact for the real recipient.
  await page.goto("about:blank");
  await page.goto(shareUrl);
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("secret-content")).toHaveText(SECRET);
});

test("the sender can destroy a secret from the receipt before it is read", async ({
  page,
  context,
}) => {
  const { shareUrl } = await createSecretViaUi(page, SECRET);
  const receiptHref = await page.getByRole("link", { name: "Open receipt" }).getAttribute("href");
  expect(receiptHref).toMatch(/\/receipt\/[A-Za-z0-9_-]{22}#/);

  const receipt = await context.newPage();
  await receipt.goto(receiptHref ?? "");
  await expect(receipt.getByText("Secret receipt")).toBeVisible();
  await expect(receipt.getByText("Active")).toBeVisible();
  await receipt.getByTestId("burn-button").click();
  await receipt.getByTestId("confirm-burn").click();
  await expect(receipt.getByText("Destroyed", { exact: true }).first()).toBeVisible();

  await page.goto(shareUrl);
  await expect(page.getByTestId("state-revoked")).toBeVisible();
});

test("unknown secrets show a not-found state", async ({ page }) => {
  await page.goto(`/s/${"A".repeat(22)}#${"b".repeat(43)}`);
  await expect(page.getByTestId("state-not_found")).toBeVisible();
});

test("keyboard-only users can create a secret", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard flow is desktop-only");
  await page.goto("/");
  const textarea = page.getByLabel("Secret", { exact: true });
  await textarea.focus();
  await page.keyboard.type("typed with keyboard only");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("share-url")).toBeVisible();
});

test("sensitive pages send strict security headers", async ({ page }) => {
  const res = await page.goto(`/s/${"A".repeat(22)}`);
  expect(res).not.toBeNull();
  const headers = res?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("script-src 'self' 'nonce-");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["x-robots-tag"]).toContain("noindex");
});

test("secret pages load no third-party resources", async ({ page }) => {
  const origins = new Set<string>();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));
  const { shareUrl } = await createSecretViaUi(page, "origin check");
  await page.goto(shareUrl);
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("secret-content")).toBeVisible();
  const base = new URL(shareUrl).origin;
  expect([...origins].filter((o) => o !== base && !o.startsWith("data:") && o !== "null")).toEqual(
    [],
  );
});
