import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const modalSource = read("../components/discovery/VendorDetailModal.jsx");
const reviewsPageSource = read("../pages/ReviewsPage.jsx");

function bodyBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing ${end} after ${start}`);
  return source.slice(startIndex, endIndex);
}

test("VendorDetailModal exposes and calls onReviewsChanged after saving an own review", () => {
  assert.match(
    modalSource,
    /export default function VendorDetailModal\(\{[^}]*\bonReviewsChanged\b[^}]*\}\)/s,
  );

  const saveBody = bodyBetween(modalSource, "function handleReviewSaved(", "\n  useEffect(() => {");
  assert.match(saveBody, /setReviews\(\(prev\) =>/);
  assert.match(saveBody, /applyVendorStats\(vendorStats\)/);
  assert.match(saveBody, /onReviewsChanged\?\.\(\)/);
  assert.ok(
    saveBody.indexOf("applyVendorStats(vendorStats)") < saveBody.indexOf("onReviewsChanged?.()"),
    "save callback should run after the modal applies updated stats",
  );
});

test("VendorDetailModal calls onReviewsChanged after deleting an own review", () => {
  const deleteBody = bodyBetween(modalSource, "async function handleDeleteReview(id)", "\n\n  function handleReviewSaved");
  assert.match(deleteBody, /await deleteReview\(id\)/);
  assert.match(deleteBody, /setReviews\(r\.reviews\)/);
  assert.match(deleteBody, /applyVendorStats\(res\.vendor\)/);
  assert.match(deleteBody, /onReviewsChanged\?\.\(\)/);
  assert.ok(
    deleteBody.indexOf("applyVendorStats(res.vendor)") < deleteBody.indexOf("onReviewsChanged?.()"),
    "delete callback should run after the modal applies updated stats",
  );
});

test("ReviewsPage refreshes reviews from page one after a modal mutation", () => {
  const refreshBody = bodyBetween(reviewsPageSource, "function refreshReviews()", "\n\n  if (sessionLoading)");
  assert.match(refreshBody, /return\s+getMyReviews\(\)/);

  const mutationBody = bodyBetween(reviewsPageSource, "function refreshReviewsAfterMutation()", "\n\n  if (sessionLoading)");
  assert.match(mutationBody, /setReviewPage\(1\)/);
  assert.match(mutationBody, /return\s+refreshReviews\(\)|await\s+refreshReviews\(\)/);
  const resetIndex = mutationBody.indexOf("setReviewPage(1)");
  const refreshIndex = Math.min(
    ...["return refreshReviews()", "await refreshReviews()"]
      .map((needle) => mutationBody.indexOf(needle))
      .filter((index) => index !== -1),
  );
  assert.ok(resetIndex < refreshIndex, "page reset should precede the reviews refresh");
});

test("ReviewsPage wires its mutation refresh callback into VendorDetailModal", () => {
  const modalBlock = bodyBetween(reviewsPageSource, "<VendorDetailModal", "\n        />");
  assert.match(modalBlock, /onReviewsChanged=\{refreshReviewsAfterMutation\}/);
});
