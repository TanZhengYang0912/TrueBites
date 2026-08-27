import test from "node:test";
import assert from "node:assert/strict";
import * as validation from "./suggestionValidation.js";

const {
  assertTransition,
  canTransition,
  isMalaccaLocation,
  platformForProfileUrl,
  platformForUrl,
  statusesForSuggestionFilter,
  validateSuggestionInput,
} = validation;

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

test("accepts TikTok and YouTube creator profile URLs", () => {
  assert.equal(platformForProfileUrl("https://www.tiktok.com/@truebites"), "TikTok");
  assert.equal(platformForProfileUrl("https://www.youtube.com/@truebites"), "YouTube");
  assert.equal(platformForProfileUrl("https://www.youtube.com/channel/UC123"), "YouTube");
  assert.equal(platformForProfileUrl("https://www.tiktok.com/@truebites/video/123"), null);
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

test("validates a creator suggestion without vendor-only fields", () => {
  const result = validateSuggestionInput({
    suggestion_type: "creator",
    creator_name: "Melaka Foodie",
    creator_profile_url: "https://www.tiktok.com/@melakafoodie",
    creator_focus: "Melaka street food and family-run stalls",
    creator_audience: "Locals and visitors exploring Melaka",
    reason: "Their practical food guides consistently surface places that deserve more attention.",
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.clean.suggestion_type, "creator");
  assert.equal(result.clean.source_kind, "profile");
  assert.equal(result.clean.source_platform, "TikTok");
  assert.equal(result.clean.creator_name, "Melaka Foodie");
  assert.equal(result.clean.vendor_name, null);
  assert.equal(result.clean.location_text, null);
});

test("requires a creator name, focus, and profile URL for creator suggestions", () => {
  const result = validateSuggestionInput({
    suggestion_type: "creator",
    reason: "A useful local food source.",
  });

  assert.ok(result.errors.creator_name);
  assert.ok(result.errors.creator_profile_url);
  assert.ok(result.errors.creator_focus);
});

test("rejects a creator suggestion that uses a video URL as its profile", () => {
  const result = validateSuggestionInput({
    suggestion_type: "creator",
    creator_name: "Melaka Foodie",
    creator_profile_url: "https://www.tiktok.com/@melakafoodie/video/123",
    creator_focus: "Melaka food guides",
    reason: "Their guides are useful for discovering local places.",
  });

  assert.ok(result.errors.creator_profile_url);
});

test("rejects unsafe creator social links", () => {
  const result = validateSuggestionInput({
    suggestion_type: "creator",
    creator_name: "Melaka Foodie",
    creator_profile_url: "https://www.tiktok.com/@melakafoodie",
    creator_focus: "Melaka food guides",
    creator_social_url: "javascript:alert(1)",
    reason: "Their guides are useful for discovering local places.",
  });

  assert.ok(result.errors.creator_social_url);
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

test("maps admin suggestion filters to concise workflow groups", () => {
  assert.deepEqual(statusesForSuggestionFilter("needs_review"), [
    "submitted",
    "under_review",
    "needs_info",
    "admin_review",
    "failed",
  ]);
  assert.deepEqual(statusesForSuggestionFilter("in_progress"), [
    "accepted_for_processing",
    "processing",
    "draft_created",
  ]);
  assert.deepEqual(statusesForSuggestionFilter("published"), ["published"]);
  assert.deepEqual(statusesForSuggestionFilter("closed"), ["rejected", "duplicate"]);
  assert.equal(statusesForSuggestionFilter("all"), null);
  assert.deepEqual(statusesForSuggestionFilter("submitted"), ["submitted"]);
  assert.equal(statusesForSuggestionFilter("not-a-filter"), null);
});
