import { test } from "node:test";
import assert from "node:assert/strict";
import { mapillaryConfidence } from "./mapillaryProvider.js";
import { NEEDS_CONFIRMATION_THRESHOLD } from "../photoMatching.js";

test("mapillaryConfidence is highest at 0m and decays to 0 at the search radius", () => {
  assert.equal(mapillaryConfidence(0), 90);
  assert.equal(mapillaryConfidence(50), 0);
  assert.equal(mapillaryConfidence(120), 0);
});

// Real-API finding: Mapillary's `radius` param is hard-capped at 50m, and a
// genuinely close photo (tested at 8m from a real vendor) needs to actually
// clear NEEDS_CONFIRMATION_THRESHOLD (60) or it never reaches the admin at
// all — the module comment explains why letting it also cross
// AUTO_SUGGEST_THRESHOLD for near-exact matches is fine (admin still clicks
// every candidate regardless of badge colour).
test("a genuinely close match (~15m) clears NEEDS_CONFIRMATION_THRESHOLD", () => {
  assert.ok(mapillaryConfidence(15) >= NEEDS_CONFIRMATION_THRESHOLD, `expected >= ${NEEDS_CONFIRMATION_THRESHOLD}, got ${mapillaryConfidence(15)}`);
});

test("a distant match (half the search radius away) does not clear NEEDS_CONFIRMATION_THRESHOLD", () => {
  assert.ok(mapillaryConfidence(25) < NEEDS_CONFIRMATION_THRESHOLD, `expected < ${NEEDS_CONFIRMATION_THRESHOLD}, got ${mapillaryConfidence(25)}`);
});

test("mapillaryConfidence handles missing/invalid distance without throwing", () => {
  assert.equal(mapillaryConfidence(null), 0);
  assert.equal(mapillaryConfidence(undefined), 0);
  assert.equal(mapillaryConfidence(NaN), 0);
});
