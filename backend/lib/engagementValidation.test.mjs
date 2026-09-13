import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REVIEW_BODY_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  parseRating,
  validateFolderName,
  validateReviewBody,
  isProfaneLoose,
} from "./engagementValidation.js";

test("parseRating accepts clean integers 1-5 only", () => {
  assert.equal(parseRating(4), 4);
  assert.equal(parseRating("4"), 4);
  assert.equal(parseRating(" 5 "), 5);
});

test("parseRating rejects non-integer and non-numeric input instead of truncating it", () => {
  assert.equal(parseRating("4.9"), null);
  assert.equal(parseRating(4.9), null);
  assert.equal(parseRating("abc"), null);
  assert.equal(parseRating(""), null);
  assert.equal(parseRating(null), null);
  assert.equal(parseRating(undefined), null);
});

test("validateFolderName rejects empty, too-long, and illegal-character names", () => {
  assert.equal(validateFolderName("").error, "Folder name is required.");
  assert.equal(validateFolderName("   ").error, "Folder name is required.");
  assert.equal(validateFolderName("a".repeat(FOLDER_NAME_MAX_LENGTH + 1)).error, `Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer.`);
  assert.match(validateFolderName("Food/Drinks").error, /cannot contain/);
});

test("validateFolderName accepts and trims a valid name", () => {
  assert.deepEqual(validateFolderName("  Weekend Trip  "), { name: "Weekend Trip" });
  assert.deepEqual(validateFolderName("a".repeat(FOLDER_NAME_MAX_LENGTH)), { name: "a".repeat(FOLDER_NAME_MAX_LENGTH) });
});

test("validateReviewBody enforces the same cap as the frontend's ReviewForm", () => {
  assert.deepEqual(validateReviewBody(""), { body: null });
  assert.deepEqual(validateReviewBody("Great food!"), { body: "Great food!" });
  assert.deepEqual(validateReviewBody("a".repeat(MAX_REVIEW_BODY_LENGTH)), { body: "a".repeat(MAX_REVIEW_BODY_LENGTH) });
  assert.equal(validateReviewBody("a".repeat(MAX_REVIEW_BODY_LENGTH + 1)).error, `Review must be ${MAX_REVIEW_BODY_LENGTH} characters or fewer.`);
});

test("isProfaneLoose flags known words, evasive spellings, and vulgar phrases", () => {
  assert.equal(isProfaneLoose("this stall is bodoh"), true);
  assert.equal(isProfaneLoose("b0d0h food"), true);
  assert.equal(isProfaneLoose("kepala hotak service"), true);
  assert.equal(isProfaneLoose("great food, will come back again"), false);
  assert.equal(isProfaneLoose(""), false);
  assert.equal(isProfaneLoose(null), false);
});
