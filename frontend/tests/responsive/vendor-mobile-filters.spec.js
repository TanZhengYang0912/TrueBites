import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const API = url => new URL(url).pathname.startsWith("/api/");
const baselinePath = resolve("tests/responsive/vendor-mobile-filters-baseline.json");
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const vendor = (id, name, status, category = "Cafe / Dessert") => ({
  id,
  name,
  fullAddress: "12 Jalan Melaka, Melaka",
  category,
  dishes: ["Cendol"],
  priceRange: "RM 10 - RM 20 per person",
  phone: "0612345678",
  latitude: 2.2,
  longitude: 102.25,
  operatingHours: "09:00 AM - 06:00 PM",
  status,
  sourcePlatform: "manual",
  sourceVideoUrl: "",
  locationPrecision: "exact",
  imageUrl: null,
  galleryUrls: [],
  coverLocked: false,
});

async function setup(page, { width = 1440, includeDuplicates = true, deferExport = false } = {}) {
  const calls = [];
  const writes = [];
  let releaseExport;
  const exportGate = new Promise(resolve => { releaseExport = resolve; });
  const vendors = [
    vendor("draft", "Draft Cafe", "draft"),
    vendor("active", "Active Cafe", "active", "Western"),
    vendor("suspended", "Draft Cafe", "suspended", "Nyonya / Peranakan"),
  ];

  await page.setViewportSize({ width, height: 1000 });
  await page.route(API, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (MUTATING_METHODS.has(request.method())) {
      writes.push({ method: request.method(), path: url.pathname });
      await route.fulfill({ status: 405, json: { error: "Synthetic fixture rejects writes" } });
      return;
    }
    if (request.method() !== "GET") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/admin/vendors") {
      const params = Object.fromEntries(url.searchParams);
      calls.push(params);
      if (deferExport && params.pageSize === "100") await exportGate;
      const pageNumber = Number(params.page || 1);
      const pageSize = Number(params.pageSize || 10);
      const total = 30;
      await route.fulfill({ json: {
        items: vendors.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        pagination: { page: pageNumber, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      } });
      return;
    }
    if (url.pathname === "/api/admin/vendors/duplicates") {
      await route.fulfill({ json: { groups: includeDuplicates ? [{
        a: { id: "draft", vendor_name: "Draft Cafe", address: "12 Jalan Melaka" },
        b: { id: "suspended", vendor_name: "Draft Cafe", address: "13 Jalan Melaka" },
        match_score: 0.9,
        match_type: "possible",
      }] : [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
  await page.goto("/admin/vendors2");
  await expect(page.getByRole("button", { name: "List", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  return { calls, writes, releaseExport };
}

function controls(page) {
  const search = page.getByPlaceholder("Search Vendors, Categories, Dishes…");
  const list = page.getByRole("button", { name: "List", exact: true });
  const map = page.getByRole("button", { name: "Map", exact: true });
  return {
    search,
    searchBox: search.locator(".."),
    list,
    map,
    view: list.locator(".."),
    category: page.getByRole("combobox").filter({ has: page.locator("option", { hasText: "All Categories" }) }),
    status: page.getByRole("combobox").filter({ has: page.locator("option", { hasText: "All Statuses" }) }),
    sort: page.getByRole("combobox").filter({ has: page.locator("option", { hasText: "Name A–Z" }) }),
    duplicates: page.getByRole("button", { name: /possible duplicate/ }),
    exportButton: page.getByRole("button", { name: /Export PDF|Preparing PDF/ }),
  };
}

async function geometry(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      style: Object.fromEntries(["fontSize", "borderRadius", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "color", "backgroundColor", "borderColor", "boxShadow"].map(key => [key, style[key]])),
    };
  });
}

function outerShape(box) {
  return { x: box.x, width: box.width, height: box.height };
}

async function desktopSnapshot(page) {
  const toolbar = controls(page);
  return Object.fromEntries(await Promise.all(Object.entries({
    searchBox: toolbar.searchBox,
    view: toolbar.view,
    category: toolbar.category,
    status: toolbar.status,
    sort: toolbar.sort,
    duplicates: toolbar.duplicates,
    exportButton: toolbar.exportButton,
  }).map(async ([name, locator]) => [name, await geometry(locator)])));
}

for (const width of [768, 1280, 1440]) {
  test(`desktop toolbar preserves the captured ${width}px geometry and styles`, async ({ page }) => {
    await setup(page, { width });
    const actual = await desktopSnapshot(page);
    if (process.env.CAPTURE_VENDOR_FILTERS_BASELINE) {
      await mkdir(resolve("responsive-output/vendor-mobile-filters"), { recursive: true });
      await page.screenshot({ path: resolve(`responsive-output/vendor-mobile-filters/desktop-${width}-before.png`), fullPage: true, animations: "disabled" });
      console.log(`VENDOR_FILTERS_BASELINE_${width}=${JSON.stringify(actual)}`);
      return;
    }
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
    expect(actual).toEqual(baseline[String(width)]);
    await mkdir(resolve("responsive-output/vendor-mobile-filters"), { recursive: true });
    await page.screenshot({ path: resolve(`responsive-output/vendor-mobile-filters/desktop-${width}-after.png`), fullPage: true, animations: "disabled" });
  });
}

for (const width of [320, 390, 430, 767]) {
  test(`phone controls form an aligned single-column toolbar at ${width}px`, async ({ page }) => {
    await setup(page, { width });
    const toolbar = controls(page);
    const ordered = [toolbar.searchBox, toolbar.view, toolbar.category, toolbar.status, toolbar.sort, toolbar.duplicates, toolbar.exportButton];
    const boxes = await Promise.all(ordered.map(control => control.boundingBox()));
    for (const [index, box] of boxes.entries()) {
      expect(box.height).toBeCloseTo(52, 0);
      expect(box.x).toBeCloseTo(boxes[0].x, 0);
      expect(box.width).toBeCloseTo(boxes[0].width, 0);
      if (index) expect(box.y - boxes[index - 1].y - boxes[index - 1].height).toBeCloseTo(12, 0);
    }
    const listBox = await toolbar.list.boundingBox();
    const mapBox = await toolbar.map.boundingBox();
    expect(listBox.width).toBeCloseTo(mapBox.width, 0);
    expect(listBox.height).toBeGreaterThanOrEqual(44);
    expect(listBox.x).toBeGreaterThanOrEqual(boxes[0].x);
    expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(boxes[0].x + boxes[0].width);
    for (const control of [toolbar.search, toolbar.category, toolbar.status, toolbar.sort, toolbar.duplicates, toolbar.exportButton, toolbar.list, toolbar.map]) {
      await expect(control).toHaveCSS("font-size", "14px");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (width === 390) {
      await mkdir(resolve("responsive-output/vendor-mobile-filters"), { recursive: true });
      await page.screenshot({ path: resolve("responsive-output/vendor-mobile-filters/phone-390-after.png"), fullPage: true, animations: "disabled" });
    }
  });
}

test("filter requests, view state, export pending state, and no-duplicate spacing retain their behavior", async ({ page }) => {
  const state = await setup(page, { width: 390, deferExport: true });
  const toolbar = controls(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 / 3", { exact: true })).toBeVisible();
  await toolbar.search.fill("draft");
  await expect.poll(() => state.calls.some(call => call.q === "draft")).toBeTruthy();
  await expect(page.getByText("Page 1 / 3", { exact: true })).toBeVisible();
  await toolbar.category.selectOption("Nyonya / Peranakan");
  const selectedCategoryBox = await toolbar.category.boundingBox();
  const selectedStatusBox = await toolbar.status.boundingBox();
  expect(selectedCategoryBox.height).toBeCloseTo(52, 0);
  expect(selectedCategoryBox.x).toBeCloseTo(selectedStatusBox.x, 0);
  expect(selectedCategoryBox.width).toBeCloseTo(selectedStatusBox.width, 0);
  await toolbar.status.selectOption("active");
  await toolbar.sort.selectOption("az");
  await expect.poll(() => state.calls.filter(call => call.pageSize === "10").at(-1)).toMatchObject({ page: "1", q: "draft", category: "Nyonya / Peranakan", status: "active", sort: "az" });
  await toolbar.map.click();
  await expect(toolbar.map).toHaveAttribute("aria-pressed", "true");
  await toolbar.list.click();
  await expect(toolbar.list).toHaveAttribute("aria-pressed", "true");
  const idleBox = await toolbar.exportButton.boundingBox();
  const categoryBox = await toolbar.category.boundingBox();
  expect(idleBox.height).toBeCloseTo(52, 0);
  expect(idleBox.width).toBeCloseTo(categoryBox.width, 0);
  await toolbar.exportButton.click();
  const pending = page.getByRole("button", { name: "Preparing PDF…", exact: true });
  await expect(pending).toBeDisabled();
  expect(outerShape(await pending.boundingBox())).toEqual(outerShape(idleBox));
  state.releaseExport();
  const completed = page.getByRole("button", { name: "Export PDF", exact: true });
  await expect(completed).toBeEnabled({ timeout: 15_000 });
  await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(outerShape(await completed.boundingBox())).toEqual(outerShape(idleBox));
  expect(state.writes).toEqual([]);

  await setup(page, { width: 390, includeDuplicates: false });
  const withoutDuplicates = controls(page);
  await expect(withoutDuplicates.duplicates).toHaveCount(0);
  const sortBox = await withoutDuplicates.sort.boundingBox();
  const exportBox = await withoutDuplicates.exportButton.boundingBox();
  expect(exportBox.y - sortBox.y - sortBox.height).toBeCloseTo(12, 0);
});
