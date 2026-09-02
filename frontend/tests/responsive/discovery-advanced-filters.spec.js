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

test("desktop discovery filters start open and update the result set", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("filters-region")).toBeVisible();
  await expect(page.getByTestId("advanced-filters")).toContainText("3 places found");
  await page.getByTestId("filter-rating").selectOption("4.5");
  await expect(page.getByTestId("advanced-filters")).toContainText("1 places found");
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeHidden();
});

test("mobile filters start closed and expand without viewport overflow", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("filters-region")).toBeHidden();
  await page.getByTestId("filters-toggle").click();
  await expect(page.getByTestId("filters-region")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("filters persist when switching between List and Map", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByTestId("filter-price").selectOption("10-20");
  await expect(page.getByTestId("advanced-filters")).toContainText("1 places found");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page).toHaveURL(/\/map\?view=map$/);
  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByTestId("filter-price")).toHaveValue("10-20");
  await expect(page.getByTestId("advanced-filters")).toContainText("1 places found");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByTestId("filter-price")).toHaveValue("10-20");
});

test("distance controls are unavailable before a location exists", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("filter-distance")).toBeDisabled();
  await expect(page.getByTestId("advanced-filters")).toContainText("Set your location to filter by distance");
  await expect(page.getByText("Sort by", { exact: true })).toHaveCount(0);
});

test("hours, open-now and Clear all stay deterministic", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByTestId("filter-hours").selectOption("breakfast");
  await expect(page.getByTestId("advanced-filters")).toContainText("2 places found");
  await page.getByTestId("filter-category").selectOption("cafe");
  await page.getByTestId("filter-open-now").click();
  await expect(page.getByTestId("advanced-filters")).toContainText("1 places found");
  await expect(page.getByRole("heading", { name: "River Cafe" })).toBeVisible();

  await page.getByTestId("clear-filters").click();
  await expect(page.getByTestId("filter-hours")).toHaveValue("any");
  await expect(page.getByTestId("filter-category")).toHaveValue("all");
  await expect(page.getByTestId("filter-open-now")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("advanced-filters")).toContainText("3 places found");
});

test("changing and clearing filters resets pagination to page one", async ({ page }) => {
  await stubDiscoveryApis(page, { vendors: PAGED_VENDORS });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Page 2" }).click();
  await expect(page.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
  await page.getByTestId("filter-rating").selectOption("4.5");
  await expect(page.getByRole("navigation", { name: "Vendor pages" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Nyonya Kitchen" })).toBeVisible();
  await page.getByTestId("clear-filters").click();
  await expect(page.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
});

test("a successful location enables distance filtering in the Map sidebar", async ({ page }) => {
  await stubDiscoveryApis(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByTestId("filter-distance")).toBeEnabled();
  await page.getByTestId("filter-distance").selectOption("1");
  await expect(page.getByTestId("advanced-filters")).toContainText("2 places found");
});

test("Melaka-centre fallback does not enable user-distance controls", async ({ page }) => {
  await stubDiscoveryApis(page, { geolocation: "failure" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByTestId("filter-distance")).toBeDisabled();
  await expect(page.getByTestId("advanced-filters")).toContainText("Set your location");
});

test("one filtered vendor remains the same sidebar row and map pin", async ({ page }) => {
  await stubDiscoveryApis(page, { vendors: [VENDORS[0]] });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByTestId("advanced-filters")).toContainText("1 places found");
  await expect(page.getByText("Nyonya Kitchen", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nyonya Kitchen" })).toBeVisible();
});
