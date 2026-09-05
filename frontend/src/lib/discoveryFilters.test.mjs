import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_VENDOR_FILTERS, filtersActive } from "./vendorFilters.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const filters = read("../components/discovery/AdvancedFilters.jsx");
const mapPage = read("../pages/MapPage.jsx");
const dashboard = read("../components/Dashboard.jsx");
const vendorPanel = read("../components/VendorPanel.jsx");

test("distance is not a vendor filter any more", () => {
  assert.equal("distance" in DEFAULT_VENDOR_FILTERS, false, "distance is still a default filter");
  assert.equal(filtersActive({ distance: "5" }), false, "a stale stored distance still counts as an active filter");
  assert.doesNotMatch(filters, /DISTANCE_OPTIONS|filter-distance|Set your location/, "AdvancedFilters still renders the distance control");
});

test("hasLocation is gone from the filter prop chain", () => {
  for (const [name, source] of [["AdvancedFilters", filters], ["MapPage", mapPage], ["Dashboard", dashboard], ["VendorPanel", vendorPanel]]) {
    assert.doesNotMatch(source, /hasLocation/, `${name} still passes the dead hasLocation prop`);
  }
});

test("distance still drives sorting and the map radius", () => {
  assert.match(read("./vendorFilters.js"), /sort === "nearest"/, "the nearest sort was removed by mistake");
  assert.match(vendorPanel, /RADII/, "the map panel radius control was removed by mistake");
});

test("search lives in the filter row, not in each page", () => {
  assert.match(filters, /data-testid="discovery-search"/, "AdvancedFilters does not own the search input");
  assert.doesNotMatch(dashboard, /data-testid="discovery-search"/, "Dashboard still renders its own search input");
  assert.doesNotMatch(vendorPanel, /aria-label="Search vendors"/, "VendorPanel still renders its own search input");
});

test("the row collapses the panel behind one icon", () => {
  assert.match(filters, /data-testid="filters-toggle"/, "the toggle is gone");
  assert.doesNotMatch(filters, /Hide filters|Show filters/, "the toggle still carries its old text label");
  assert.match(filters, /sm:flex-row/, "the row does not use the reviews-page stacking rule");
  assert.match(filters, /activeCount/, "the toggle does not show how many filters are on");
});

const header = read("../components/discovery/DiscoveryHeader.jsx");
const guestPrompt = read("../components/discovery/GuestPrompt.jsx");

test("guests are prompted, not redirected, from the account nav", () => {
  assert.match(header, /GuestPrompt/, "the header cannot show the guest prompt");
  assert.match(header, /!session && !ENGAGEMENT_TEST_MODE/, "the guard does not match Dashboard's condition");
  assert.doesNotMatch(header, /href="\/saved"/, "Saved is still a plain link that guests get bounced from");
  assert.doesNotMatch(header, /href="\/reviews"/, "My reviews is still a plain link");
  assert.doesNotMatch(header, /href="\/suggestions"/, "Suggest is still a plain link");
});

test("the guest prompt names both account paths", () => {
  assert.match(guestPrompt, />\s*Log In or Sign Up\s*</, "the guest prompt hides the Sign Up path");
});
