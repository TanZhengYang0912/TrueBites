import { expect, test } from "@playwright/test";

test("the filter toggle opens and closes the panel", async ({ page }) => {
  await page.goto("/discover", { waitUntil: "networkidle" });
  const panel = page.getByTestId("filters-region");
  await expect(panel).toBeHidden();

  await page.getByTestId("filters-toggle").click({ timeout: 5000 });
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("filter-distance")).toHaveCount(0);

  await page.getByTestId("filters-toggle").click({ timeout: 5000 });
  await expect(panel).toBeHidden();
});

test("search and creator stay reachable without opening the panel", async ({ page }) => {
  await page.goto("/discover", { waitUntil: "networkidle" });
  await page.getByLabel("Search places").fill("nasi");
  await expect(page.getByLabel("Search places")).toHaveValue("nasi");
  await expect(page.getByTestId("filter-creator")).toBeVisible();
});
