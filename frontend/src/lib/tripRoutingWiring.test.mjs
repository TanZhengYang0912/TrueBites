import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mapPage = readFileSync(new URL("../pages/MapPage.jsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../components/DirectionsRenderer.jsx", import.meta.url), "utf8");
const tripPanel = readFileSync(new URL("../components/TripPanel.jsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/Dashboard.jsx", import.meta.url), "utf8");
const vendorPanel = readFileSync(new URL("../components/VendorPanel.jsx", import.meta.url), "utf8");
const vendorMarkers = readFileSync(new URL("../components/VendorMarkers.jsx", import.meta.url), "utf8");
const vendorCard = readFileSync(new URL("../components/discovery/VendorCard.jsx", import.meta.url), "utf8");
const vendorDetail = readFileSync(new URL("../components/discovery/VendorDetailModal.jsx", import.meta.url), "utf8");
const savedPage = readFileSync(new URL("../pages/SavedPage.jsx", import.meta.url), "utf8");
const reviewsPage = readFileSync(new URL("../pages/ReviewsPage.jsx", import.meta.url), "utf8");

test("MapPage blocks constrained routes before Google", () => {
  assert.match(mapPage, /getRouteConstraint\(travelMode,\s*trip\.length\)/);
  assert.match(mapPage, /travelMode\s*&&\s*!routeConstraint/);
  assert.match(mapPage, /onError=\{setDirError\}/);
  assert.match(mapPage, /routeConstraint\s*\?\s*EMPTY_ROUTE_SUMMARY/);
});

test("a trip or mode change clears all previous Google route state", () => {
  assert.match(
    mapPage,
    /setRouteIndex\(0\);\s*setDirError\(null\);\s*setDirSummary\(null\);\s*setRouteOptions\(\[\]\);\s*setTransitLegs\(\[\]\);/,
  );
});

test("DirectionsRenderer forwards failures instead of hard-coding No route available", () => {
  assert.match(renderer, /onError/);
  assert.match(renderer, /\.catch\(\(error\)\s*=>/);
  assert.match(renderer, /onError\?\.\(error\)/);
  assert.doesNotMatch(renderer, /No route available/);
});

test("DirectionsRenderer clears every Google result when fewer than two stops remain", () => {
  assert.match(
    renderer,
    /if \(!stops \|\| stops\.length < 2 \|\| !travelMode\) \{[\s\S]{0,240}onSummary\?\.\(null\);[\s\S]{0,120}onRoutes\?\.\(\[\]\);[\s\S]{0,120}onTransitLegs\?\.\(\[\]\);/,
  );
});

test("DirectionsRenderer stays detached until the replacement route succeeds", () => {
  assert.doesNotMatch(renderer, /rendererRef\.current\.setMap\(map\);/);
  assert.match(
    renderer,
    /function applyResult\(result\) \{[\s\S]{0,180}rendererRef\.current\?\.setMap\(map\);\s*rendererRef\.current\?\.setDirections\(result\);/,
  );
});

test("TripPanel renders a route-level status separate from summary", () => {
  assert.match(tripPanel, /routeMessage/);
  assert.match(tripPanel, /role="status"/);
  assert.match(tripPanel, /loading && !routeMessage/);
  assert.match(tripPanel, /summary && \(!loading \|\| routeMessage\)/);
});

test("MapPage guards vendor, custom, and automatic-origin additions", () => {
  assert.match(
    mapPage,
    /function addStop\(vendor\) \{[\s\S]{0,200}if \(isTripAtLimit\(trip\.length\)\) \{ showTripLimit\(\); return; \}/,
  );
  assert.match(
    mapPage,
    /function addCustomStop\(place\) \{\s*if \(isTripAtLimit\(trip\.length\)\) \{ showTripLimit\(\); return; \}/,
  );
  assert.match(
    mapPage,
    /const hasMe = trip\.some[\s\S]{0,120}if \(!hasMe && isTripAtLimit\(trip\.length\)\)/,
  );
  assert.match(mapPage, /TRIP_LIMIT_ADD_MESSAGE/);
});

test("capacity reaches every add surface", () => {
  for (const source of [dashboard, vendorPanel, vendorMarkers, vendorCard, vendorDetail, tripPanel]) {
    assert.match(source, /tripAtLimit/);
  }
  assert.match(tripPanel, /onTripLimit/);
});

test("full-trip controls remain focusable and explain the limit", () => {
  for (const source of [vendorPanel, vendorMarkers, vendorCard, vendorDetail, tripPanel]) {
    assert.match(source, /aria-disabled/);
  }
});

test("Saved and My Reviews cannot bypass the shared trip capacity", () => {
  for (const source of [savedPage, reviewsPage]) {
    assert.match(source, /const tripAtLimit = isTripAtLimit\(tripStopIds\.size\)/);
    assert.match(source, /result === "limit"[\s\S]{0,100}TRIP_LIMIT_ADD_MESSAGE/);
    assert.match(source, /tripAtLimit=\{tripAtLimit\}/);
  }
});
