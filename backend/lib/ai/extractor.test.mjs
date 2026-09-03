import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backfillFromSummary } from "./extractor.js";

test("AI extraction explicitly excludes promotion date ranges from operating hours", () => {
  const source = readFileSync(new URL("./extractor.js", import.meta.url), "utf8");
  assert.match(source, /Do not treat promotion dates or date ranges as opening hours/i);
});

test("backfillFromSummary: fills vendor_name and city from a typical AI summary opener", () => {
  const summary = "This video features a food spot in Melaka. The influencer reviews the cendol here.";
  const result = backfillFromSummary({ vendor_name: null, city: null }, summary);
  assert.equal(result.city, "Melaka");
  assert.equal(result.is_in_malacca, true);
});

test("backfillFromSummary: recognises a named eatery pattern", () => {
  const summary = "This is a recommendation for a cafe called Chacos Berlauk in Melaka.";
  const result = backfillFromSummary({ vendor_name: null, city: null }, summary);
  assert.ok(result.vendor_name);
});

test("backfillFromSummary: never overwrites an already-present value", () => {
  const result = backfillFromSummary({ vendor_name: "Already Known", city: "Kuala Lumpur" }, "This video features a food spot in Melaka.");
  assert.equal(result.vendor_name, "Already Known");
  assert.equal(result.city, "Kuala Lumpur");
});

test("backfillFromSummary: no-op when there's no summary or nothing matches", () => {
  const result = backfillFromSummary({ vendor_name: null, city: null }, "");
  assert.equal(result.vendor_name, null);
  assert.equal(result.city, null);
});
