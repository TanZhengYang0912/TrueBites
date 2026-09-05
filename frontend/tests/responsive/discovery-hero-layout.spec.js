import { expect, test } from "@playwright/test";

async function stubVendors(page) {
  await page.route("http://localhost:4000/api/restaurants/nearby?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));
}

test("desktop swaps the community CTA and search widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await stubVendors(page);
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  const hero = page.getByRole("heading", { name: /Hidden gems, authentic flavours/i });
  const cta = page.getByTestId("community-discoveries-cta");
  const search = page.getByTestId("discovery-search");
  const [heroBox, ctaBox, searchBox] = await Promise.all([
    hero.boundingBox(),
    cta.boundingBox(),
    search.boundingBox(),
  ]);

  expect(heroBox).not.toBeNull();
  expect(ctaBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  await expect(cta.getByText("Share it", { exact: true })).toBeVisible();
  expect(ctaBox.x).toBeGreaterThan(heroBox.x);
  expect(searchBox.y).toBeGreaterThan(ctaBox.y + ctaBox.height);
  expect(searchBox.width).toBeGreaterThan(ctaBox.width * 2);
});

test("mobile stacks title, community CTA, then search", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await stubVendors(page);
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  const hero = page.getByRole("heading", { name: /Hidden gems, authentic flavours/i });
  const cta = page.getByTestId("community-discoveries-cta");
  const search = page.getByTestId("discovery-search");
  const [heroBox, ctaBox, searchBox] = await Promise.all([
    hero.boundingBox(),
    cta.boundingBox(),
    search.boundingBox(),
  ]);

  expect(heroBox).not.toBeNull();
  await expect(cta.getByText("Share it", { exact: true })).toBeHidden();
  expect(ctaBox.y).toBeGreaterThan(heroBox.y + heroBox.height);
  expect(searchBox.y).toBeGreaterThan(ctaBox.y + ctaBox.height);
  expect(ctaBox.width).toBeLessThanOrEqual(375);
  expect(searchBox.width).toBeLessThanOrEqual(375);
});
