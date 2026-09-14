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
const vendorDetail = read("../components/discovery/VendorDetailModal.jsx");

test("the wallet icon and price wrap as one unit", () => {
  assert.match(vendorCard, /<span className="inline-flex items-center gap-1 whitespace-nowrap">\s*<Wallet size=\{12\} \/>\s*<span>\{price\}<\/span>/);
});

test("the card action row stays pinned below wrapping metadata", () => {
  const metadataStart = vendorCard.indexOf('<div className="flex flex-wrap items-center gap-1.5 pt-2.5');
  const actionStart = vendorCard.indexOf('<div className="mt-auto flex flex-wrap items-center justify-between');

  assert.match(vendorCard, /<article className="[^"]*\bflex\b[^\"]*\bh-full\b[^\"]*\bflex-col\b/);
  assert.match(vendorCard, /<div className="flex min-h-\[166px\] flex-1 flex-col p-4">/);
  assert.ok(metadataStart >= 0, "the metadata row should remain discoverable");
  assert.ok(actionStart > metadataStart, "the action row should follow the metadata row");
  assert.match(
    vendorCard.slice(actionStart, actionStart + 120),
    /className="mt-auto flex flex-wrap items-center justify-between/,
  );
  assert.doesNotMatch(
    vendorCard.slice(metadataStart, metadataStart + 120),
    /className="mt-auto /,
  );
});

test("the card gallery cannot stretch the four-by-three image box", () => {
  assert.match(
    vendorCard,
    /<div className="absolute inset-0">\s*<VendorGallery/,
  );
});

test("vendor details put location before rating and price without an empty location row", () => {
  const body = vendorDetail.slice(
    vendorDetail.indexOf("{/* Body */}"),
    vendorDetail.indexOf("{/* Cuisine/dish tags */}"),
  );
  const locationStart = body.indexOf("{vendor.address && (");
  const ratingStart = body.indexOf("stats.review_count > 0");
  const priceStart = body.indexOf("price && <MetaItem");

  assert.ok(locationStart >= 0, "location should render only when an address exists");
  assert.ok(ratingStart > locationStart, "rating should follow location");
  assert.ok(priceStart > ratingStart, "price should follow rating");
});

const filters = read("../components/discovery/AdvancedFilters.jsx");

test("Discover filters are pills in a plain container", () => {
  assert.doesNotMatch(filters, /filter-glass/);
  assert.doesNotMatch(filters, /rounded-md/);
  assert.ok((filters.match(/rounded-full/g) || []).length >= 10);
  for (const value of ["filters-toggle", "activeCount", "clear-filters", "filters-region"]) {
    assert.match(filters, new RegExp(value));
  }
  assert.match(filters, /xl:grid-cols-6/);
});
