import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUrl } from "./urlValidation.js";

test("accepts TikTok video URLs, including short links", () => {
  assert.equal(validateUrl("https://www.tiktok.com/@diarimelaka/video/7487038890935717128").valid, true);
  assert.equal(validateUrl("https://vm.tiktok.com/ZMabc123/").platform, "tiktok");
  assert.equal(validateUrl("https://vt.tiktok.com/ZMabc123/").url_type, "video");
});

test("accepts TikTok profile URLs", () => {
  const result = validateUrl("https://www.tiktok.com/@diarimelaka");
  assert.equal(result.valid, true);
  assert.equal(result.url_type, "profile");
});

test("accepts YouTube video/shorts URLs and profile URLs", () => {
  assert.equal(validateUrl("https://www.youtube.com/watch?v=abc123").url_type, "video");
  assert.equal(validateUrl("https://youtu.be/abc123").url_type, "video");
  assert.equal(validateUrl("https://www.youtube.com/shorts/abc123").url_type, "video");
  assert.equal(validateUrl("https://www.youtube.com/@someone").url_type, "profile");
  assert.equal(validateUrl("https://www.youtube.com/channel/UC123").url_type, "profile");
});

test("rejects garbage/unrelated URLs", () => {
  const result = validateUrl("https://example.com/not-a-video");
  assert.equal(result.valid, false);
  assert.equal(result.platform, null);
});

test("rejects empty input", () => {
  assert.equal(validateUrl("").valid, false);
  assert.equal(validateUrl(null).valid, false);
});
