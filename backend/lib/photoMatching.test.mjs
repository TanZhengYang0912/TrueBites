import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePhotoMatchConfidence,
  distanceToScore,
  nameSimilarityScore,
  AUTO_SUGGEST_THRESHOLD,
  NEEDS_CONFIRMATION_THRESHOLD,
} from "./photoMatching.js";

const vendor = {
  vendor_name: "Chacos Berlauk",
  latitude: 2.1896,
  longitude: 102.2501,
  cuisine_types: "Malaysian / Local",
};

test("strong name match + very close distance -> auto-suggest confidence", () => {
  const { confidence } = computePhotoMatchConfidence({
    vendor,
    candidate: { placeName: "Chacos Berlauk", latitude: 2.1896, longitude: 102.2501, category: "restaurant" },
  });
  assert.ok(confidence >= AUTO_SUGGEST_THRESHOLD, `expected >= ${AUTO_SUGGEST_THRESHOLD}, got ${confidence}`);
});

test("similar-but-not-exact name + ~200m away -> lands in the confirmation band, not auto-suggest", () => {
  const { confidence } = computePhotoMatchConfidence({
    vendor,
    // ~204m at this latitude — close enough to earn solid partial distance
    // credit, while the "Cafe" suffix keeps name similarity short of perfect
    // and the generic "restaurant" category only earns partial credit too
    // (it doesn't specifically confirm "Malaysian / Local").
    candidate: { placeName: "Chacos Berlauk Cafe", latitude: 2.1909, longitude: 102.2514, category: "restaurant" },
  });
  assert.ok(confidence >= NEEDS_CONFIRMATION_THRESHOLD, `expected >= ${NEEDS_CONFIRMATION_THRESHOLD}, got ${confidence}`);
  assert.ok(confidence < AUTO_SUGGEST_THRESHOLD, `expected < ${AUTO_SUGGEST_THRESHOLD}, got ${confidence}`);
});

test("unrelated name -> low confidence even if nearby", () => {
  const { confidence } = computePhotoMatchConfidence({
    vendor,
    candidate: { placeName: "Totally Different Shop", latitude: 2.1896, longitude: 102.2501, category: "restaurant" },
  });
  assert.ok(confidence < NEEDS_CONFIRMATION_THRESHOLD, `expected < ${NEEDS_CONFIRMATION_THRESHOLD}, got ${confidence}`);
});

test("distanceToScore decays to 0 at the cutoff and is clamped, never negative", () => {
  assert.equal(distanceToScore(0), 1);
  assert.equal(distanceToScore(500), 0);
  assert.equal(distanceToScore(5000), 0);
});

test("nameSimilarityScore is 1 for an identical name", () => {
  assert.equal(nameSimilarityScore("Chacos Berlauk", "Chacos Berlauk"), 1);
});

test("breakdown carries the fields the admin UI needs", () => {
  const { breakdown } = computePhotoMatchConfidence({
    vendor,
    candidate: { placeName: "Chacos Berlauk", latitude: 2.1897, longitude: 102.2502, category: "restaurant" },
  });
  assert.equal(breakdown.matchedPlaceName, "Chacos Berlauk");
  assert.ok(typeof breakdown.distanceMeters === "number");
  assert.ok(typeof breakdown.nameSimilarityPct === "number");
  assert.equal(breakdown.category, "restaurant");
  assert.equal(breakdown.categoryMatch, true);
});
