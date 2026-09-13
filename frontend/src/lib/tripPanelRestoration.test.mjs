import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/TripPanel.jsx", import.meta.url), "utf8");

test("current inline trip rows show Google leg metadata and vendor status", () => {
  assert.match(source, /rowsFor\(trip, draftStops\)/);
  assert.match(source, /arrivalsById/);
  assert.match(source, /stopStatusPresentation/);
  assert.match(source, /from previous stop/);
  assert.match(source, /from start/);
  assert.match(source, /row\.priceLabel/);
  assert.doesNotMatch(source, /distanceLabel\(row\.vendor\)/);
});

test("best order feedback keeps the existing control and disables Transit", () => {
  assert.match(source, />Search area</);
  assert.match(source, /<Plus size=\{13\} \/> Add stop/);
  assert.match(source, /Finding best order…/);
  assert.match(source, /travelMode === "TRANSIT"/);
  assert.match(source, /disabled=\{[^}]*travelMode === "TRANSIT"/);
  assert.match(source, /Suggest Best Order/);
});

test("Transit scope and Google attribution stay compact without the removed notice card", () => {
  assert.match(source, /transitScopeMessage/);
  assert.match(source, /routeWarnings\.map/);
  assert.match(source, /routeCopyrights/);
  assert.match(source, /biasCenter=\{locationBias\}/);
  assert.match(source, /sanitizeGoogleAttributions/);
  assert.doesNotMatch(source, /Route notice:/);
});
