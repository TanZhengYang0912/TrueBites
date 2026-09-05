import { expect, test } from "@playwright/test";

const VENDORS = [
  {
    id: "nyonya-kitchen",
    name: "Nyonya Kitchen",
    cuisine_types: "Nyonya / Peranakan",
    signature_dishes: "Ayam pongteh, cendol",
    source_video_url: "https://www.tiktok.com/@melakafoodie/video/1",
    price_range: "RM 10 - RM 20 per person",
    operating_hours_raw: "09:00 AM - 10:00 PM",
    average_rating: 4.8,
    review_count: 42,
    latitude: 2.1901,
    longitude: 102.2501,
    address: "Jonker Street",
    photos: [],
  },
  {
    id: "river-cafe",
    name: "River Cafe",
    cuisine_types: "Cafe / Dessert",
    signature_dishes: "Kopi and kaya toast",
    source_video_url: "https://www.tiktok.com/@diarimelaka/video/2",
    price_range: "RM 6 per person",
    operating_hours_raw: "24 hours",
    average_rating: 4.2,
    review_count: 18,
    latitude: 2.191,
    longitude: 102.249,
    address: "Melaka River",
    photos: [],
  },
  {
    id: "night-grill",
    name: "Night Grill",
    cuisine_types: "Western",
    signature_dishes: "Mixed grill",
    source_video_url: "https://www.tiktok.com/@melakafoodandtravel/video/3",
    price_range: "RM 45 per person",
    operating_hours_raw: "05:00 PM - 02:00 AM",
    average_rating: 3,
    review_count: 7,
    latitude: 2.23,
    longitude: 102.29,
    address: "Melaka Raya",
    photos: [],
  },
];

const PAGED_VENDORS = [
  ...VENDORS,
  ...Array.from({ length: 12 }, (_, index) => ({
    ...VENDORS[1],
    id: `cafe-${index + 1}`,
    name: `Cafe ${index + 1}`,
    average_rating: 2.5,
    latitude: 2.2 + index * 0.001,
    longitude: 102.26 + index * 0.001,
  })),
];

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function stubDiscoveryApis(page, { vendors = VENDORS, geolocation = "success" } = {}) {
  await page.route("http://localhost:4000/api/restaurants/nearby?*", (route) => route.fulfill(json(vendors)));
  await page.route("http://localhost:4000/api/engagement/folders", (route) => route.fulfill(json({ folders: [] })));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill(json({ bookmarks: [] })));
  await page.addInitScript((mode) => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          if (mode === "failure") failure(new Error("Location unavailable"));
          else success({ coords: { latitude: 2.1896, longitude: 102.2501 } });
        },
      },
    });
  }, geolocation);
}

async function openFilters(page) {
  const toggle = page.getByTestId("filters-toggle");
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  await expect(page.getByTestId("filters-region")).toBeVisible();
}

test("discovery filters start collapsed and update the result set when opened", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("filters-region")).toBeHidden();
  await openFilters(page);
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night Grill" })).toBeVisible();
  await page.getByTestId("filter-rating").selectOption("4.5");
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeHidden();
});

test("mobile filters start closed and expand without viewport overflow", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("filters-region")).toBeHidden();
  await openFilters(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("filters persist while their panel is closed and reopened", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  await openFilters(page);
  await page.getByTestId("filter-price").selectOption("10-20");
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeHidden();
  await page.getByTestId("filters-toggle").click();
  await expect(page.getByTestId("filters-region")).toBeHidden();
  await openFilters(page);
  await expect(page.getByTestId("filter-price")).toHaveValue("10-20");
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeHidden();
});

test("distance is not a discovery filter", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  await openFilters(page);
  await expect(page.getByTestId("filter-distance")).toHaveCount(0);
  await expect(page.getByText("Set your location to filter by distance")).toHaveCount(0);
});

test("hours, open-now and Clear all stay deterministic", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  await openFilters(page);
  await page.getByTestId("filter-hours").selectOption("breakfast");
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night Grill" })).toBeHidden();
  await page.getByTestId("filter-category").selectOption("cafe");
  await page.getByTestId("filter-open-now").click();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeVisible();

  await page.getByTestId("clear-filters").click();
  await expect(page.getByTestId("filter-hours")).toHaveValue("any");
  await expect(page.getByTestId("filter-category")).toHaveValue("all");
  await expect(page.getByTestId("filter-open-now")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night Grill" })).toBeVisible();
});

test("changing and clearing filters resets pagination to page one", async ({ page }) => {
  await stubDiscoveryApis(page, { vendors: PAGED_VENDORS });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/discover", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Page 2" }).click();
  await expect(page.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
  await openFilters(page);
  await page.getByTestId("filter-rating").selectOption("4.5");
  await expect(page.getByRole("navigation", { name: "Vendor pages" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await page.getByTestId("clear-filters").click();
  await expect(page.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
});

test("the Map sidebar keeps its separate nearby-radius controls", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByRole("button", { name: "2km" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "1km" }).click();
  await expect(page.getByRole("button", { name: "1km" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("filter-distance")).toHaveCount(0);
});

test("Melaka-centre fallback keeps the nearby-radius controls available", async ({ page }) => {
  await stubDiscoveryApis(page, { geolocation: "failure" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByRole("button", { name: "2km" })).toBeVisible();
  await expect(page.getByTestId("filter-distance")).toHaveCount(0);
});

test("one filtered vendor remains the same sidebar row and map pin", async ({ page }) => {
  await stubDiscoveryApis(page, { vendors: [VENDORS[0]] });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByText("Nyonya Kitchen", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nyonya Kitchen" })).toBeVisible();
});
