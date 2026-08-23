import test from "node:test";
import assert from "node:assert/strict";
import {
  assertTransition,
  canTransition,
  isMalaccaLocation,
  platformForUrl,
  validateSuggestionInput,
} from "./suggestionValidation.js";

test("accepts Malacca TikTok and YouTube video URLs", () => {
  assert.equal(platformForUrl("https://www.tiktok.com/@truebites/video/123"), "TikTok");
  assert.equal(platformForUrl("https://www.youtube.com/watch?v=abc123"), "YouTube");
  assert.equal(platformForUrl("https://youtu.be/abc123"), "YouTube");
});

test("rejects profile URLs and unrelated hosts", () => {
  assert.equal(platformForUrl("https://www.tiktok.com/@truebites"), null);
  assert.equal(platformForUrl("https://www.youtube.com/@truebites"), null);
  assert.equal(platformForUrl("https://example.com/video/123"), null);
});

test("recognises both Malacca spellings and rejects other locations", () => {
  assert.equal(isMalaccaLocation("Jonker Street, Melaka"), true);
  assert.equal(isMalaccaLocation("Malacca City, Malaysia"), true);
  assert.equal(isMalaccaLocation("George Town, Penang"), false);
});

test("validates the complete customer submission", () => {
  const result = validateSuggestionInput({
    vendor_name: "Kedai Nyonya",
    influencer_name: "Melaka Foodie",
    source_url: "https://www.youtube.com/watch?v=abc123",
    location_text: "Jonker Street, Melaka",
    reason: "The handmade nyonya kuih is excellent and worth sharing.",
    category: "Nyonya",
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.clean.source_platform, "YouTube");
  assert.equal(result.clean.influencer_name, "Melaka Foodie");
});

test("keeps influencer name optional while enforcing its length", () => {
  const withoutInfluencer = validateSuggestionInput({
    vendor_name: "Kedai Nyonya",
    source_url: "https://www.youtube.com/watch?v=abc123",
    location_text: "Jonker Street, Melaka",
    reason: "The handmade nyonya kuih is excellent and worth sharing.",
  });
  assert.equal(withoutInfluencer.errors.influencer_name, undefined);
  assert.equal(withoutInfluencer.clean.influencer_name, null);

  const tooLong = validateSuggestionInput({
    vendor_name: "Kedai Nyonya",
    influencer_name: "x".repeat(121),
    source_url: "https://www.youtube.com/watch?v=abc123",
    location_text: "Jonker Street, Melaka",
    reason: "The handmade nyonya kuih is excellent and worth sharing.",
  });
  assert.ok(tooLong.errors.influencer_name);
});

test("rejects non-Malacca and short submissions", () => {
  const result = validateSuggestionInput({
    vendor_name: "A",
    source_url: "https://www.youtube.com/watch?v=abc123",
    location_text: "Penang",
    reason: "Nice",
  });
  assert.ok(result.errors.vendor_name);
  assert.ok(result.errors.location_text);
  assert.ok(result.errors.reason);
});

test("allows only documented state transitions", () => {
  assert.equal(canTransition("submitted", "under_review"), true);
  assert.equal(canTransition("published", "processing"), false);
  assert.throws(() => assertTransition("submitted", "published"), /Cannot change/);
});
