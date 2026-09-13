import { expect, test } from "@playwright/test";

test.use({ geolocation: { latitude: 2.1896, longitude: 102.2501 }, permissions: ["geolocation"] });

const vendors = Array.from({ length: 32 }, (_, index) => ({
  id: `vendor-${index + 1}`,
  name: `Vendor ${String(index + 1).padStart(2, "0")}`,
  latitude: 2.1897 + index * 0.00001,
  longitude: 102.2501,
  price_range: "RM 10 - RM 20 per person",
  cuisine_types: "Malaysian / Local",
  status: "active",
}));

test("Vendor tab reveals 15 at a time and permits repeat add", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("truebites:welcome-seen", "1"));
  await page.route("**/api/restaurants/nearby?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(vendors),
  }));
  await page.goto("/map");
  await page.getByRole("tab", { name: /Trip/ }).click();
  await expect(page.locator('[data-stop-type="anchor"] input')).toHaveValue(/./, { timeout: 15000 });
  await page.getByRole("tab", { name: /Vendors/ }).click();

  const rows = page.getByTestId("nearby-vendor-row");
  await expect(rows).toHaveCount(15);
  await expect(page.getByText("Showing 15 of 32")).toBeVisible();
  await page.getByRole("button", { name: "Show 15 more" }).click();
  await expect(rows).toHaveCount(30);
  await expect(page.getByText("Showing 30 of 32")).toBeVisible();

  const add = page.getByRole("button", { name: "Add Vendor 01 to trip" });
  await add.click();
  await expect(page.getByText("Vendor 01 added to trip as stop 2.")).toBeVisible();
  await add.click();
  await expect(page.getByText("Vendor 01 added to trip as stop 3.")).toBeVisible();
  await expect(rows).toHaveCount(30);

  await page.getByRole("tab", { name: /Trip/ }).click();
  await expect(page.locator('[data-stop-type="vendor"]')).toHaveCount(2);
  await expect(page.locator('[data-stop-type="vendor"]').filter({ hasText: "Vendor 01" })).toHaveCount(2);
});
