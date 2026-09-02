import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const mapPage = read("../pages/MapPage.jsx");

test("MapPage owns the complete canonical filter and sort state", () => {
  assert.match(mapPage, /useState\(DEFAULT_VENDOR_FILTERS\)/);
  assert.match(mapPage, /useState\(DEFAULT_VENDOR_SORT\)/);
  assert.match(mapPage, /setFilters\(DEFAULT_VENDOR_FILTERS\)/);
  assert.match(mapPage, /setSort\(DEFAULT_VENDOR_SORT\)/);
});

test("MapPage derives location-aware distances only from a user origin", () => {
  assert.match(mapPage, /const vendorsWithDistance = useMemo/);
  assert.match(mapPage, /userPos\s*\?/);
  assert.match(mapPage, /haversineKm\(userPos\.lat, userPos\.lng/);
  assert.match(mapPage, /distKm:\s*undefined/);
});

test("MapPage derives one filtered sorted collection and shares it with both views", () => {
  assert.match(mapPage, /const filteredVendors = useMemo/);
  assert.match(mapPage, /vendorsWithDistance\.filter\(\(vendor\) => matchesFilters\(vendor, filters\)\)/);
  assert.match(mapPage, /sortVendors\(/);
  assert.match(mapPage, /<Dashboard[\s\S]*?filteredVendors=\{filteredVendors\}/);
  assert.match(mapPage, /<VendorPanel[\s\S]*?filteredVendors=\{filteredVendors\}/);
  assert.match(mapPage, /hasLocation=\{userPos != null\}/);
});

test("map pins and nearby rows reuse the shared result instead of matching again", () => {
  assert.match(mapPage, /const filteredIds = new Set\(filteredVendors\.map/);
  assert.match(mapPage, /const nearbyToAdd = anchor\s*\? filteredVendors/);
  const sharedPipeline = mapPage.slice(mapPage.indexOf("const filteredIds"));
  assert.doesNotMatch(sharedPipeline, /matchesFilters\(/);
});

test("AdvancedFilters exposes every approved control and responsive semantics", () => {
  const componentUrl = new URL("../components/discovery/AdvancedFilters.jsx", import.meta.url);
  assert.equal(existsSync(componentUrl), true, "AdvancedFilters.jsx must exist");
  const source = readFileSync(componentUrl, "utf8");
  for (const testId of [
    "advanced-filters",
    "filters-toggle",
    "filters-region",
    "filter-category",
    "filter-creator",
    "filter-price",
    "filter-hours",
    "filter-rating",
    "filter-distance",
    "filter-open-now",
    "filter-sort",
    "clear-filters",
  ]) {
    assert.match(source, new RegExp(`data-testid=["']${testId}["']`));
  }
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-controls/);
  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked/);
});

test("AdvancedFilters disables and explains location-dependent controls", () => {
  const componentUrl = new URL("../components/discovery/AdvancedFilters.jsx", import.meta.url);
  assert.equal(existsSync(componentUrl), true, "AdvancedFilters.jsx must exist");
  const source = readFileSync(componentUrl, "utf8");
  assert.match(source, /hasLocation/);
  assert.match(source, /Set your location/);
  assert.match(source, /disabled=\{!hasLocation\}/);
  assert.match(source, /disabledOption=/);
});
