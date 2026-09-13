import { expect, test } from "@playwright/test";

test("the filter row still works after restyling", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("truebites:welcome-seen", "1"));
  await page.goto("/discover");
  const toggle = page.getByTestId("filters-toggle");
  await expect(toggle).toBeVisible();
  expect(parseFloat(await toggle.evaluate((node) => getComputedStyle(node).borderRadius))).toBeGreaterThanOrEqual(22);
  await toggle.click();
  await expect(page.getByTestId("filters-region")).toBeVisible();
  await page.getByTestId("filter-price").selectOption({ index: 1 });
  await expect(page.getByTestId("clear-filters")).toBeEnabled();
});
