import { expect, test } from "@playwright/test";

const FOLDER_RESPONSE = JSON.stringify({ folders: [{ id: "default", name: "Default", is_default: true }] });
const BOOKMARK_RESPONSE = JSON.stringify({ bookmarks: [] });
const REVIEW_RESPONSE = JSON.stringify({ reviews: [{
  id: "review-1",
  rating: 5,
  body: "A useful review",
  created_at: "2026-08-01T00:00:00.000Z",
  vendor: { id: "vendor-1", name: "Test vendor", address: "Melaka", cuisine_types: "Cafe" },
}] });

async function stubEngagementApi(page) {
  await page.route("http://localhost:4000/api/engagement/folders", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: FOLDER_RESPONSE,
  }));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: BOOKMARK_RESPONSE,
  }));
  await page.route("http://localhost:4000/api/engagement/reviews/mine", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: REVIEW_RESPONSE,
  }));
}

async function radius(page, locator) {
  return locator.evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
}

async function gap(page, locator) {
  return locator.evaluate((element) => getComputedStyle(element).columnGap);
}

test("saved places and reviews use the square control shape", async ({ page }) => {
  await stubEngagementApi(page);
  await page.goto("/engagement", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: /New folder/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "All 0" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Default 0" })).toBeVisible();
  expect(await radius(page, page.getByRole("button", { name: /New folder/ }))).toBe("6px");
  const allFolder = page.getByRole("button", { name: "All 0" });
  const defaultFolder = page.getByRole("button", { name: "Default 0" });
  expect(await radius(page, allFolder.locator(".."))).toBe("6px");
  expect(await radius(page, defaultFolder.locator(".."))).toBe("6px");
  expect(await gap(page, allFolder)).toBe("6px");
  expect(await gap(page, defaultFolder)).toBe("6px");

  await page.goto("/engagement?tab=reviews", { waitUntil: "networkidle" });
  await expect(page.getByPlaceholder("Search by place or review text")).toBeVisible();
  expect(await radius(page, page.getByPlaceholder("Search by place or review text"))).toBe("6px");
  expect(await radius(page, page.getByRole("combobox", { name: "Filter by rating" }))).toBe("6px");
  expect(await radius(page, page.getByRole("combobox", { name: "Sort reviews" }))).toBe("6px");
});

test("suggestion status tabs use the square control shape", async ({ page }) => {
  await page.route("http://localhost:4000/api/suggestions/mine", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ suggestions: [] }),
  }));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: BOOKMARK_RESPONSE,
  }));
  await page.goto("/suggestions", { waitUntil: "networkidle" });

  const allTab = page.getByRole("button", { name: /^all \d+$/ });
  await expect(allTab).toBeVisible();
  expect(await radius(page, allTab)).toBe("6px");
});

test("suggestion type and status filters share one desktop rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("http://localhost:4000/api/suggestions/mine", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ suggestions: [] }),
  }));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: BOOKMARK_RESPONSE,
  }));
  await page.goto("/suggestions", { waitUntil: "networkidle" });

  const everything = page.getByRole("button", { name: /^Everything \d+$/ });
  const all = page.getByRole("button", { name: /^all \d+$/ });
  await expect(everything).toBeVisible();
  await expect(all).toBeVisible();

  const yPositions = await Promise.all([everything, all].map((button) => button.evaluate((element) => Math.round(element.getBoundingClientRect().top))));
  expect(yPositions[0]).toBe(yPositions[1]);
});

test("suggestions keeps the make-a-suggestion action in the intro area", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("http://localhost:4000/api/suggestions/mine", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ suggestions: [], counts: { types: { all: 0, vendor: 0, creator: 0 }, statuses: { all: 0, pending: 0, published: 0, rejected: 0 } }, pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1 } }),
  }));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: BOOKMARK_RESPONSE,
  }));
  await page.goto("/suggestions", { waitUntil: "networkidle" });

  const action = page.getByRole("button", { name: "Make a suggestion", exact: true }).first();
  await expect(action).toBeVisible();
  const actionBox = await action.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, viewportWidth: window.innerWidth };
  });
  expect(actionBox.left).toBeGreaterThan(actionBox.viewportWidth / 2);
  await expect(page.getByTestId("suggestion-filter-rail").getByRole("button", { name: /Make a suggestion/ })).toHaveCount(0);

  await page.goto("/suggestions/new", { waitUntil: "networkidle" });
  const backAction = page.getByRole("button", { name: "Back", exact: true });
  await expect(backAction).toBeVisible();
  const backActionBox = await backAction.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, viewportWidth: window.innerWidth };
  });
  expect(backActionBox.left).toBeGreaterThan(backActionBox.viewportWidth / 2);
});

test("admin suggestions uses five workflow filters and applies them immediately", async ({ page }) => {
  const requests = [];
  await page.route("http://localhost:4000/api/admin/suggestions?*", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestions: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } }),
    });
  });

  await page.goto("/admin/suggestions", { waitUntil: "networkidle" });

  const workflowFilter = page.getByRole("combobox", { name: "Filter suggestion workflow" });
  await expect(workflowFilter).toBeVisible();
  await expect(workflowFilter.locator("option")).toHaveCount(5);
  await expect(workflowFilter).toHaveValue("needs_review");
  await expect(page.getByText("Apply filters", { exact: true })).toHaveCount(0);
  expect(requests[0].searchParams.get("status")).toBe("needs_review");

  await workflowFilter.selectOption("closed");
  await expect.poll(() => requests.at(-1)?.searchParams.get("status")).toBe("closed");
});
