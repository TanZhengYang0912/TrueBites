import { expect, test } from "@playwright/test";

test("the suggestion form back button returns to the suggestions page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/suggestions/new", { waitUntil: "networkidle" });

  const back = page.getByRole("button", { name: "Back", exact: true });
  await expect(back).toBeVisible();
  await expect(page.getByRole("button", { name: "My suggestions", exact: true })).toHaveCount(0);

  await back.click();
  await expect(page).toHaveURL(/\/suggestions$/);
});

test("the suggestion form back button follows in-app history", async ({ page }) => {
  await page.goto("/suggestions", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Make a suggestion", exact: true }).first().click();
  await expect(page).toHaveURL(/\/suggestions\/new$/);

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/suggestions$/);
});
