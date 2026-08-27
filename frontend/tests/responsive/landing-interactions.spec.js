import { expect, test } from "@playwright/test";

test.describe("landing and discovery navigation", () => {
  test("keeps only Plan Visit in the landing header and CTA", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    const landingNav = page.locator("nav").first();
    await expect(landingNav.getByText("DISCOVER", { exact: true })).toHaveCount(0);
    await expect(landingNav.getByText("EXPLORE", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Start Exploring", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Plan Visit" }).first()).toBeVisible();
  });

  test("returns to the top when Plan Visit changes from the landing route", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Plan Visit" }).first().click();
    await expect(page).toHaveURL(/\/map$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("returns to the top when the discovery dashboard changes page", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Hidden gems, authentic flavours/i })).toBeVisible();
    const nextPage = page.getByRole("button", { name: "Next page" });
    await expect(nextPage).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await nextPage.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});
