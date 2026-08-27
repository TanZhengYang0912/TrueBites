import { expect, test } from "@playwright/test";

test("admin AI queue omits the Food Influencer Content Analyzer banner", async ({ page }) => {
  await page.goto("/admin/ai", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".admin-ai-module-inner")).toBeVisible();
  await expect(page.getByText("Batch Results", { exact: true })).toBeVisible();
  await expect(page.locator(".admin-hero-banner")).toHaveCount(0);
  await expect(page.getByText("Food Influencer Content Analyzer", { exact: true })).toHaveCount(0);
});
