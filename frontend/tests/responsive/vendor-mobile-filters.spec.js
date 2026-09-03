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
  test(`phone controls form the approved two-column toolbar at ${width}px`, async ({ page }) => {
    await setup(page, { width });
    const toolbar = controls(page);
    const box = Object.fromEntries(await Promise.all(
      ["searchBox", "view", "category", "status", "sort", "duplicates", "exportButton"]
        .map(async name => [name, await toolbar[name].boundingBox()])
    ));
    for (const name of ["searchBox", "view", "duplicates"]) {
      expect(box[name].x).toBeCloseTo(box.searchBox.x, 0);
      expect(box[name].width).toBeCloseTo(box.searchBox.width, 0);
    }
    for (const [left, right] of [["category", "status"], ["sort", "exportButton"]]) {
      expect(box[left].y).toBeCloseTo(box[right].y, 0);
      expect(box[left].width).toBeCloseTo(box[right].width, 0);
      expect(box[right].x - box[left].x - box[left].width).toBeCloseTo(12, 0);
      expect(box[left].width * 2 + 12).toBeCloseTo(box.searchBox.width, 0);
    }
    expect(box.sort.x).toBeCloseTo(box.category.x, 0);
    expect(box.exportButton.x).toBeCloseTo(box.status.x, 0);
    for (const [previous, next] of [["searchBox", "view"], ["view", "category"], ["category", "sort"], ["sort", "duplicates"]]) {
      expect(box[next].y - box[previous].y - box[previous].height).toBeCloseTo(12, 0);
    }
    for (const value of Object.values(box)) expect(value.height).toBeCloseTo(52, 0);
    const listBox = await toolbar.list.boundingBox();
    const mapBox = await toolbar.map.boundingBox();
    expect(listBox.width).toBeCloseTo(mapBox.width, 0);
    expect(listBox.height).toBeGreaterThanOrEqual(44);
    expect(listBox.x).toBeGreaterThanOrEqual(box.searchBox.x);
    expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(box.searchBox.x + box.searchBox.width);
    for (const control of [toolbar.search, toolbar.category, toolbar.status, toolbar.sort, toolbar.duplicates, toolbar.exportButton, toolbar.list, toolbar.map]) {
      await expect(control).toHaveCSS("font-size", "14px");
    }
    if (width === 320) {
      const defaultCategory = await toolbar.category.evaluate(select => {
        const style = getComputedStyle(select);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return {
          label: select.selectedOptions[0].text,
          labelWidth: context.measureText(select.selectedOptions[0].text).width,
          contentWidth: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        };
      });
      expect(defaultCategory.label).toBe("All Categories");
      expect(defaultCategory.labelWidth).toBeLessThanOrEqual(defaultCategory.contentWidth);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if ([320, 390].includes(width)) {
      await mkdir(resolve("responsive-output/vendor-mobile-filters"), { recursive: true });
      await page.screenshot({ path: resolve(`responsive-output/vendor-mobile-filters/phone-two-column-${width}-after.png`), fullPage: true, animations: "disabled" });
    }
  });
}

async function expectTabOrder(page, first, following) {
  await first.focus();
  await expect(first).toBeFocused();
  for (const control of following) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
  }
}

async function expectActionDomOrder(page, order) {
  await expect.poll(() => page.locator(".vendor-filter-controls > .vendor-filter-duplicates, .vendor-filter-controls > .vendor-filter-export").evaluateAll(elements =>
    elements.map(element => element.classList.contains("vendor-filter-export") ? "export" : "duplicates")
  )).toEqual(order);
}

test("native phone tab order follows visual action order without positive tabindex", async ({ page }) => {
  await setup(page, { width: 390 });
  const toolbar = controls(page);
  await expectTabOrder(page, toolbar.search, [toolbar.list, toolbar.map, toolbar.category, toolbar.status, toolbar.sort, toolbar.exportButton, toolbar.duplicates]);
  expect(await page.locator("[tabindex]").evaluateAll(elements => elements.filter(element => Number(element.getAttribute("tabindex")) > 0).length)).toBe(0);
});

test("desktop, phone, then desktop preserves filter values, native control count, and each action order", async ({ page }) => {
  await setup(page, { width: 1440 });
  const toolbar = controls(page);
  await toolbar.category.selectOption("Nyonya / Peranakan");
  await toolbar.status.selectOption("active");
  await toolbar.sort.selectOption("az");
  const controlCount = await page.locator(".vendor-filter-controls input, .vendor-filter-controls button, .vendor-filter-controls select").count();
  await expectActionDomOrder(page, ["duplicates", "export"]);
  await expectTabOrder(page, toolbar.search, [toolbar.list, toolbar.map, toolbar.category, toolbar.status, toolbar.sort, toolbar.duplicates, toolbar.exportButton]);

  await page.setViewportSize({ width: 390, height: 1000 });
  await expectActionDomOrder(page, ["export", "duplicates"]);
  await expect(toolbar.category).toHaveValue("Nyonya / Peranakan");
  await expect(toolbar.status).toHaveValue("active");
  await expect(toolbar.sort).toHaveValue("az");
  expect(await page.locator(".vendor-filter-controls input, .vendor-filter-controls button, .vendor-filter-controls select").count()).toBe(controlCount);
  await expectTabOrder(page, toolbar.search, [toolbar.list, toolbar.map, toolbar.category, toolbar.status, toolbar.sort, toolbar.exportButton, toolbar.duplicates]);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectActionDomOrder(page, ["duplicates", "export"]);
  await expect(toolbar.category).toHaveValue("Nyonya / Peranakan");
  await expect(toolbar.status).toHaveValue("active");
  await expect(toolbar.sort).toHaveValue("az");
  expect(await page.locator(".vendor-filter-controls input, .vendor-filter-controls button, .vendor-filter-controls select").count()).toBe(controlCount);
  await expectTabOrder(page, toolbar.search, [toolbar.list, toolbar.map, toolbar.category, toolbar.status, toolbar.sort, toolbar.duplicates, toolbar.exportButton]);
});

function textRect(locator) {
  return locator.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    const button = element.closest("button").getBoundingClientRect();
    return {
      x: rect.x - button.x,
      y: rect.y - button.y,
      right: rect.right - button.x,
      bottom: rect.bottom - button.y,
      buttonWidth: button.width,
      buttonHeight: button.height,
    };
  });
}

function expectTextContained(rect) {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.right).toBeLessThanOrEqual(rect.buttonWidth);
  expect(rect.bottom).toBeLessThanOrEqual(rect.buttonHeight);
}

test("320px pending export retains half-width geometry and contained labels", async ({ page }) => {
  const state = await setup(page, { width: 320, deferExport: true });
  const toolbar = controls(page);
  const sortBox = await toolbar.sort.boundingBox();
  const idle = await toolbar.exportButton.boundingBox();
  expect(idle.height).toBeCloseTo(52, 0);
  expect(idle.width).toBeCloseTo(sortBox.width, 0);
  expect(idle.y).toBeCloseTo(sortBox.y, 0);
  expectTextContained(await textRect(toolbar.exportButton.locator("span")));
  await toolbar.exportButton.click();
  const pending = page.getByRole("button", { name: "Preparing PDF…", exact: true });
  await expect(pending).toBeDisabled();
  const pendingBox = await pending.boundingBox();
  expect(pendingBox.height).toBeCloseTo(52, 0);
  expect(pendingBox.width).toBeCloseTo(sortBox.width, 0);
  expect(pendingBox.y).toBeCloseTo(sortBox.y, 0);
  expectTextContained(await textRect(pending.locator("span")));
  state.releaseExport();
  const completed = page.getByRole("button", { name: "Export PDF", exact: true });
  await expect(completed).toBeEnabled({ timeout: 15_000 });
  expectTextContained(await textRect(completed.locator("span")));
  expect(state.writes).toEqual([]);
});

test("filter requests, view state, and no-duplicate spacing retain their behavior", async ({ page }) => {
  const state = await setup(page, { width: 390 });
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
  expect(selectedCategoryBox.y).toBeCloseTo(selectedStatusBox.y, 0);
  expect(selectedCategoryBox.width).toBeCloseTo(selectedStatusBox.width, 0);
  await toolbar.status.selectOption("active");
  await toolbar.sort.selectOption("az");
  await expect.poll(() => state.calls.filter(call => call.pageSize === "10").at(-1)).toMatchObject({ page: "1", q: "draft", category: "Nyonya / Peranakan", status: "active", sort: "az" });
  await toolbar.map.click();
  await expect(toolbar.map).toHaveAttribute("aria-pressed", "true");
  await toolbar.list.click();
  await expect(toolbar.list).toHaveAttribute("aria-pressed", "true");
  expect(state.writes).toEqual([]);

  await setup(page, { width: 390, includeDuplicates: false });
  const withoutDuplicates = controls(page);
  await expect(withoutDuplicates.duplicates).toHaveCount(0);
  const sortBox = await withoutDuplicates.sort.boundingBox();
  const exportBox = await withoutDuplicates.exportButton.boundingBox();
  expect(exportBox.y).toBeCloseTo(sortBox.y, 0);
  expect(exportBox.width).toBeCloseTo(sortBox.width, 0);
  expect(exportBox.x - sortBox.x - sortBox.width).toBeCloseTo(12, 0);
  const controlsBox = await page.locator(".vendor-filter-controls").boundingBox();
  expect(controlsBox.y + controlsBox.height).toBeCloseTo(exportBox.y + exportBox.height, 0);
});
