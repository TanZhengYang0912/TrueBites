import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VENDOR_FILTERS,
  DEFAULT_VENDOR_SORT,
  filtersActive,
  matchesFilters,
  parseOperatingWindow,
  parsePriceRange,
  sortVendors,
} from "./vendorFilters.js";

const NANCY = {
  id: "n",
  name: "Nancy's Kitchen",
  cuisine_types: "Nyonya / Peranakan",
  signature_dishes: "Ayam Pongteh, Cendol",
  source_video_url: "https://www.tiktok.com/@melakafoodie/video/123",
};
const DAILY_FIX = {
  id: "d",
  name: "The Daily Fix Cafe",
  cuisine_types: "Cafe / Dessert",
  signature_dishes: "Pandan pancake",
  source_video_url: "",
};

const COMPLETE = {
  ...NANCY,
  price_range: "RM 10 - RM 20 per person",
  operating_hours_raw: "09:00 AM - 11:00 PM",
  average_rating: 4.6,
  review_count: 25,
  distKm: 1.4,
};

test("exports the complete default filter contract", () => {
  assert.deepEqual(DEFAULT_VENDOR_FILTERS, {
    search: "",
    category: "all",
    creator: "all",
    price: "all",
    hours: "any",
    rating: "any",
    distance: "any",
    openNow: false,
  });
  assert.equal(DEFAULT_VENDOR_SORT, "relevant");
});

test("no filters lets every vendor through", () => {
  assert.equal(matchesFilters(NANCY), true);
  assert.equal(matchesFilters(DAILY_FIX, {}), true);
});

test("search matches name, cuisine and signature dishes, case-insensitively", () => {
  assert.equal(matchesFilters(NANCY, { search: "nancy" }), true);
  assert.equal(matchesFilters(NANCY, { search: "PERANAKAN" }), true);
  assert.equal(matchesFilters(NANCY, { search: "cendol" }), true);
  assert.equal(matchesFilters(NANCY, { search: "tandoori" }), false);
});

test("whitespace-only search is not a filter", () => {
  assert.equal(matchesFilters(NANCY, { search: "   " }), true);
});

test("category narrows to a cuisine, and 'all' does not narrow", () => {
  assert.equal(matchesFilters(NANCY, { category: "nyonya" }), true);
  assert.equal(matchesFilters(NANCY, { category: "cafe" }), false);
  assert.equal(matchesFilters(NANCY, { category: "all" }), true);
});

test("creator narrows to one handle", () => {
  assert.equal(matchesFilters(NANCY, { creator: "@melakafoodie" }), true);
  assert.equal(matchesFilters(NANCY, { creator: "@kuihhunter" }), false);
  assert.equal(matchesFilters(DAILY_FIX, { creator: "@melakafoodie" }), false);
});

test("filters combine with AND", () => {
  assert.equal(matchesFilters(NANCY, { search: "nancy", category: "nyonya" }), true);
  assert.equal(matchesFilters(NANCY, { search: "nancy", category: "cafe" }), false);
});

test("missing fields never throw", () => {
  assert.equal(matchesFilters({ id: "x" }, { search: "anything" }), false);
  assert.equal(matchesFilters({ id: "x" }), true);
});

test("filtersActive reports whether any filter is narrowing", () => {
  assert.equal(filtersActive(), false);
  assert.equal(filtersActive({ search: "  ", category: "all", creator: "all" }), false);
  assert.equal(filtersActive({ search: "kopi" }), true);
  assert.equal(filtersActive({ category: "cafe" }), true);
  assert.equal(filtersActive({ creator: "@kuihhunter" }), true);
});

test("strictly parses stored price ranges and single prices", () => {
  assert.deepEqual(parsePriceRange("RM 10 - RM 20 per person"), { min: 10, max: 20 });
  assert.deepEqual(parsePriceRange("RM8 per person"), { min: 8, max: 8 });
  assert.deepEqual(parsePriceRange("RM 20 - 10"), { min: 10, max: 20 });
  assert.equal(parsePriceRange("affordable and delicious"), null);
});

test("price filters match overlapping stored ranges", () => {
  assert.equal(matchesFilters(COMPLETE, { price: "under-10" }), false);
  assert.equal(matchesFilters(COMPLETE, { price: "10-20" }), true);
  assert.equal(matchesFilters({ ...COMPLETE, price_range: "RM 35 - RM 55" }, { price: "40-plus" }), true);
  assert.equal(matchesFilters({ ...COMPLETE, price_range: null }, { price: "10-20" }), false);
});

test("parses daytime and overnight operating windows", () => {
  assert.deepEqual(parseOperatingWindow("09:00 AM - 11:00 PM"), { open: 540, close: 1380 });
  assert.deepEqual(parseOperatingWindow("10:00 PM - 02:00 AM"), { open: 1320, close: 120 });
  assert.equal(parseOperatingWindow("usually evenings"), null);
});

test("operating-period filters use overlap, including late night", () => {
  assert.equal(matchesFilters(COMPLETE, { hours: "lunch" }), true);
  assert.equal(matchesFilters(COMPLETE, { hours: "late-night" }), true);
  assert.equal(matchesFilters({ ...COMPLETE, operating_hours_raw: "06:00 AM - 10:00 AM" }, { hours: "dinner" }), false);
  assert.equal(matchesFilters({ ...COMPLETE, operating_hours_raw: null }, { hours: "dinner" }), false);
});

test("open now evaluates Kuala Lumpur time deterministically", () => {
  const openInstant = new Date("2026-09-02T05:00:00.000Z"); // 13:00 MYT
  const closedInstant = new Date("2026-09-02T16:30:00.000Z"); // 00:30 MYT
  assert.equal(matchesFilters(COMPLETE, { openNow: true }, { now: openInstant }), true);
  assert.equal(matchesFilters(COMPLETE, { openNow: true }, { now: closedInstant }), false);
  assert.equal(matchesFilters({ ...COMPLETE, operating_hours_raw: null }, { openNow: true }, { now: openInstant }), false);
});

test("rating and distance require known values when active", () => {
  assert.equal(matchesFilters(COMPLETE, { rating: "4.5" }), true);
  assert.equal(matchesFilters(COMPLETE, { rating: "5" }), false);
  assert.equal(matchesFilters(COMPLETE, { distance: "2" }), true);
  assert.equal(matchesFilters(COMPLETE, { distance: "1" }), false);
  assert.equal(matchesFilters({ ...COMPLETE, average_rating: null }, { rating: "3" }), false);
  assert.equal(matchesFilters({ ...COMPLETE, distKm: undefined }, { distance: "2" }), false);
});

test("all active filters combine with AND", () => {
  assert.equal(matchesFilters(COMPLETE, {
    search: "cendol",
    category: "nyonya",
    creator: "@melakafoodie",
    price: "10-20",
    hours: "dinner",
    rating: "4.5",
    distance: "2",
  }), true);
  assert.equal(matchesFilters(COMPLETE, {
    search: "cendol",
    category: "nyonya",
    price: "under-10",
  }), false);
});

test("active-state detection includes advanced filters and sorting", () => {
  assert.equal(filtersActive(DEFAULT_VENDOR_FILTERS, DEFAULT_VENDOR_SORT), false);
  assert.equal(filtersActive({ ...DEFAULT_VENDOR_FILTERS, openNow: true }, DEFAULT_VENDOR_SORT), true);
  assert.equal(filtersActive(DEFAULT_VENDOR_FILTERS, "rating"), true);
});

test("sorting is stable and keeps missing values last", () => {
  const rows = [
    { id: "a", average_rating: 4, review_count: 3, distKm: 3, price_range: "RM20" },
    { id: "b", average_rating: 5, review_count: 1, distKm: 1, price_range: null },
    { id: "c", average_rating: 5, review_count: 7, distKm: null, price_range: "RM10" },
    { id: "d", average_rating: null, review_count: 99, distKm: 1, price_range: "RM10" },
  ];
  assert.deepEqual(sortVendors(rows, "rating").map((vendor) => vendor.id), ["c", "b", "a", "d"]);
  assert.deepEqual(sortVendors(rows, "nearest").map((vendor) => vendor.id), ["b", "d", "a", "c"]);
  assert.deepEqual(sortVendors(rows, "price-low").map((vendor) => vendor.id), ["c", "d", "a", "b"]);
  assert.deepEqual(sortVendors(rows, "relevant").map((vendor) => vendor.id), ["a", "b", "c", "d"]);
});
