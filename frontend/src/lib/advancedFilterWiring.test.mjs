import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const mapPage = read("../pages/MapPage.jsx");
const dashboard = read("../components/Dashboard.jsx");
const vendorPanel = read("../components/VendorPanel.jsx");
const vendorMarkers = read("../components/VendorMarkers.jsx");

test("MapPage owns the complete canonical filter and sort state", () => {
  assert.match(mapPage, /useState\(DEFAULT_VENDOR_FILTERS\)/);
  assert.match(mapPage, /useState\(DEFAULT_VENDOR_SORT\)/);
  assert.match(mapPage, /setFilters\(DEFAULT_VENDOR_FILTERS\)/);
  assert.match(mapPage, /setSort\(DEFAULT_VENDOR_SORT\)/);
});

test("MapPage derives location-aware distances only from a user origin", () => {
  assert.match(mapPage, /const vendorsWithDistance = useMemo/);
  assert.match(mapPage, /distanceOrigin\s*\?/);
  assert.match(mapPage, /haversineKm\(distanceOrigin\.lat, distanceOrigin\.lng/);
  assert.match(mapPage, /distKm:\s*undefined/);
});

test("MapPage keeps Melaka-centre fallback separate from a real distance origin", () => {
  assert.match(mapPage, /const \[distanceOrigin, setDistanceOrigin\] = useState\(null\)/);
  assert.match(mapPage, /hasLocation=\{distanceOrigin != null\}/);
  assert.doesNotMatch(mapPage, /setDistanceOrigin\(MELAKA_CENTER\)/);
});

test("MapPage derives one filtered sorted collection and shares it with both views", () => {
  assert.match(mapPage, /const filteredVendors = useMemo/);
  assert.match(mapPage, /vendorsWithDistance\.filter\(\(vendor\) => matchesFilters\(vendor, filters\)\)/);
  assert.match(mapPage, /sortVendors\(/);
  assert.match(mapPage, /<Dashboard[\s\S]*?filteredVendors=\{filteredVendors\}/);
  assert.match(mapPage, /<VendorPanel[\s\S]*?filteredVendors=\{filteredVendors\}/);
  assert.match(mapPage, /hasLocation=\{distanceOrigin != null\}/);
});

test("map pins and nearby rows reuse the shared result instead of matching again", () => {
  assert.match(mapPage, /const filteredIds = new Set\(filteredVendors\.map/);
  assert.match(mapPage, /const nearbyToAdd = anchor\s*\? filteredVendors/);
  const sharedPipeline = mapPage.slice(mapPage.indexOf("const filteredIds"));
  assert.doesNotMatch(sharedPipeline, /matchesFilters\(/);
});

test("a focused vendor cannot bypass active discovery filters", () => {
  assert.match(mapPage, /const visibleFocusVendor = focusVendor && \(stopIds\.has\(focusVendor\.id\) \|\| filteredIds\.has\(focusVendor\.id\)\)/);
  assert.match(mapPage, /focusVendor: visibleFocusVendor/);
  assert.match(mapPage, /<FocusOnVendor vendor=\{visibleFocusVendor\}/);
});

test("individual map pins expose their vendor name", () => {
  assert.match(vendorMarkers, /<AdvancedMarker[\s\S]*?title=\{vendor\.name\}/);
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

test("Dashboard renders controlled advanced filters and paginates the shared result", () => {
  assert.match(dashboard, /<AdvancedFilters/);
  assert.match(dashboard, /resultCount=\{filteredVendors\.length\}/);
  assert.match(dashboard, /paginate\(filteredVendors, page, PAGE_SIZE\)/);
  assert.match(dashboard, /value=\{filters\.search\}/);
  assert.match(dashboard, /onClear=\{onClearFilters\}/);
  assert.doesNotMatch(dashboard, /<FilterChips/);
});

test("VendorPanel uses controlled search and the compact shared panel", () => {
  assert.match(vendorPanel, /value=\{filters\.search\}/);
  assert.match(vendorPanel, /<AdvancedFilters/);
  assert.match(vendorPanel, /resultCount=\{filteredVendors\.length\}/);
  assert.match(vendorPanel, /compact/);
  assert.doesNotMatch(vendorPanel, /<FilterChips/);
});
