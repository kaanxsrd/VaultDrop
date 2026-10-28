import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

const PUBLIC_PAGES = [
  "/",
  "/how-it-works",
  "/security",
  "/pricing",
  "/docs",
  "/docs/api",
  "/changelog",
  "/status",
  "/privacy",
  "/terms",
  "/contact",
  "/sign-in",
  "/sign-up",
];

test("every public page renders with a heading and no horizontal overflow", async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first(), path).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
  }
});

test("mobile navigation opens and navigates", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Simple plans");
});

test("theme toggle switches to dark mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Change color theme" }).first().click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("unknown routes show the branded 404", async ({ page }) => {
  const res = await page.goto("/definitely-not-here");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Nothing here — and nothing left behind")).toBeVisible();
});

for (const path of [
  "/",
  "/pricing",
  "/security",
  "/how-it-works",
  "/docs",
  "/sign-in",
  `/s/${"A".repeat(22)}`,
]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Audit the settled page: mid-fade scroll reveals would otherwise fail color-contrast at random.
    await page.addStyleTag({
      content: "[data-reveal]{opacity:1!important;transform:none!important}",
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}
