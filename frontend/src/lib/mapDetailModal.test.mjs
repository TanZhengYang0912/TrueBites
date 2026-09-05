import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const mapPage = read("../pages/MapPage.jsx");
const markers = read("../components/VendorMarkers.jsx");

test("bookmarking on the map prompts a guest instead of ejecting them", () => {
  assert.match(mapPage, /GuestPrompt/, "MapPage cannot show the guest prompt");
  assert.doesNotMatch(mapPage, /!session && !ENGAGEMENT_TEST_MODE\) \{ navigate\("\/login"\)/,
    "toggleBookmark still sends guests straight to /login");
});

test("the InfoWindow shows a cover photo", () => {
  assert.match(markers, /vendorGallery/, "the InfoWindow has no photo");
  assert.match(markers, /FOOD_PHOTO_POSITION/, "the photo does not use the shared food crop");
  assert.doesNotMatch(markers, /placeholderImage\(/, "placeholderImage returns null with no cover and would leave an empty frame");
});

test("View details opens the app's own modal, not Google Maps", () => {
  assert.doesNotMatch(markers, /google\.com\/maps\/search/, "the InfoWindow still links out to Google Maps");
  assert.doesNotMatch(markers, /View details ↗/, "the button still carries the external-link arrow");
  assert.match(markers, /onViewDetails/, "VendorMarkers has no way to ask for the detail modal");
  assert.doesNotMatch(markers, /VendorDetailModal/, "VendorMarkers should not own the modal");
  assert.match(mapPage, /<VendorDetailModal/, "MapPage does not mount the detail modal");
  assert.match(mapPage, /onViewDetails=\{/, "MapPage does not pass the callback to VendorMarkers");
});
