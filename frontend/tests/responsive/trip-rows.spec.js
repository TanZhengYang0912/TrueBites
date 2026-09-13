import { expect, test } from "@playwright/test";

test.use({ geolocation: { latitude: 2.1896, longitude: 102.2501 }, permissions: ["geolocation"] });

const VENDORS = [{
  id: "vendor-1", name: "Test Kopitiam", latitude: 2.195, longitude: 102.255,
  address: "Jalan Test, Melaka", price_range: "RM 8 - RM 15 per person",
  cuisine_types: "Malaysian / Local", status: "active",
}];

async function openTrip(page) {
  await page.addInitScript(() => window.localStorage.setItem("truebites:welcome-seen", "1"));
  await page.route("**/api/restaurants/nearby?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(VENDORS),
  }));
  await page.goto("/map");
  await page.getByRole("tab", { name: /Trip/ }).click();
  const anchor = page.locator('[data-stop-type="anchor"]');
  await expect(anchor.locator("input")).toHaveValue(/./, { timeout: 15000 });
  return anchor;
}

test("anchor is labelled, editable, and has no remove action", async ({ page }) => {
  const anchor = await openTrip(page);
  await expect(anchor).toContainText("Search area");
  await expect(anchor.getByRole("button", { name: "Remove stop" })).toHaveCount(0);
  await expect(anchor.getByRole("button", { name: /current location/ })).toBeVisible();
});

test("Add stop creates one focused custom draft", async ({ page }) => {
  await openTrip(page);
  await page.getByRole("button", { name: "Add stop" }).click();
  const custom = page.locator('[data-stop-type="custom"]');
  await expect(custom).toHaveCount(1);
  await expect(custom.getByPlaceholder("Search a place…")).toBeFocused();
  await expect(custom).toHaveAttribute("draggable", "false");
});

test("vendor rows have no input or GPS action", async ({ page }) => {
  await openTrip(page);
  await page.getByRole("tab", { name: /Vendors/ }).click();
  await page.getByRole("button", { name: /^Add .+ to trip$/ }).first().click();
  await page.getByRole("tab", { name: /Trip/ }).click();
  const vendor = page.locator('[data-stop-type="vendor"]');
  await expect(vendor.locator("input")).toHaveCount(0);
  await expect(vendor.getByRole("button", { name: /current location/ })).toHaveCount(0);
});

test("GPS denial preserves one empty anchor before a vendor", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => window.localStorage.setItem("truebites:welcome-seen", "1"));
  await page.route("**/api/restaurants/nearby?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(VENDORS),
  }));
  await page.goto("/discover");
  await page.getByRole("button", { name: "Add to trip" }).first().click();
  await page.goto("/map");
  await page.getByRole("tab", { name: /Trip/ }).click();

  const rows = page.locator("[data-stop-id]");
  await expect(rows).toHaveCount(2);
  const anchor = rows.nth(0);
  await expect(anchor).toHaveAttribute("data-stop-type", "anchor");
  await expect(anchor.getByPlaceholder("Choose search area…")).toHaveValue("");
  await expect(anchor.getByRole("button", { name: "Remove stop" })).toHaveCount(0);
  await expect(rows.nth(1)).toHaveAttribute("data-stop-type", "vendor");
  await expect(rows.nth(1)).toContainText("2");
});
