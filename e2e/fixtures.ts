import { test as base, expect, type Page } from "@playwright/test";

/** Each test gets its own pseudo client IP so the real rate limiter isolates tests from each other. */
export const test = base.extend({
  context: async ({ context }, use) => {
    const ip = `10.${rand()}.${rand()}.${rand()}`;
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": ip });
    await use(context);
  },
});

function rand() {
  return Math.floor(Math.random() * 254) + 1;
}

export { expect };

/** Creates a secret through the real UI and returns the share URL. */
export async function createSecretViaUi(
  page: Page,
  text: string,
  opts: { passphrase?: string } = {},
) {
  await page.goto("/");
  await page.getByLabel("Secret", { exact: true }).fill(text);
  if (opts.passphrase) {
    await page.getByRole("switch", { name: "Require a passphrase" }).click();
    await page.getByPlaceholder("Shared separately").fill(opts.passphrase);
  }
  await page.getByRole("button", { name: "Create secret link" }).click();
  const shareInput = page.getByTestId("share-url");
  await expect(shareInput).toBeVisible();
  const shareUrl = await shareInput.inputValue();
  return { shareUrl };
}
