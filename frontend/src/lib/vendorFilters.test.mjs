import test from "node:test";
import assert from "node:assert/strict";
import { matchesFilters, filtersActive } from "./vendorFilters.js";

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
