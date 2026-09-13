import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const header = read("../components/discovery/DiscoveryHeader.jsx");

test("the logo goes to Discover and says so", () => {
  const logo = header.match(/<Link[\s\S]*?truebites-logo\.png[\s\S]*?<\/Link>/)?.[0] || "";
  assert.match(logo, /to="\/discover"/);
  assert.match(logo, /aria-label="Go to Discover"/);
  assert.match(logo, /title="Go to Discover"/);
});

const vendorCard = read("../components/discovery/VendorCard.jsx");

test("the wallet icon and price wrap as one unit", () => {
  assert.match(vendorCard, /<span className="inline-flex items-center gap-1 whitespace-nowrap">\s*<Wallet size=\{12\} \/>\s*<span>\{price\}<\/span>/);
});

const filters = read("../components/discovery/AdvancedFilters.jsx");

test("Discover filters are pills in a plain container", () => {
  assert.doesNotMatch(filters, /filter-glass/);
  assert.doesNotMatch(filters, /rounded-md/);
  assert.ok((filters.match(/rounded-full/g) || []).length >= 10);
  for (const value of ["filters-toggle", "activeCount", "clear-filters", "filters-region"]) {
    assert.match(filters, new RegExp(value));
  }
});
