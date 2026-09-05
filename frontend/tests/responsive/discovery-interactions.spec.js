import { expect, test } from "@playwright/test";

const NEARBY_FIXTURE = {
  status: 200,
  body: JSON.stringify(Array.from({ length: 13 }, (_, index) => ({
    id: `pagination-vendor-${index + 1}`,
    vendor_name: `Pagination vendor ${index + 1}`,
    name: `Pagination vendor ${index + 1}`,
    address: "Jonker Street, Melaka",
    latitude: 2.1896,
    longitude: 102.2501,
    lat: 2.1896,
    lng: 102.2501,
    cuisine_types: "Malaysian / Local",
    signature_dishes: "Nasi Lemak",
    price_range: "RM 10 - RM 20 per person",
    source_platform: "TikTok",
    average_rating: null,
    review_count: 0,
  }))),
};

test.describe("discovery navigation", () => {
  test("returns to the top when the discovery dashboard changes page", async ({ page }) => {
    // Skip the first-visit welcome popup — this test is about pagination
    // scroll behaviour, not the popup.
    await page.addInitScript(() => window.localStorage.setItem("truebites:welcome-seen", "1"));
    await page.route("http://localhost:4000/api/restaurants/nearby?*", (route) => route.fulfill({
      status: NEARBY_FIXTURE.status,
      contentType: "application/json",
      body: NEARBY_FIXTURE.body,
    }));
    await page.goto("/discover", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Welcome to Melaka/i })).toBeVisible();
    const nextPage = page.getByRole("button", { name: "Next page" });
    await expect(nextPage).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await nextPage.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});
