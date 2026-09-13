import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mapPage = readFileSync(new URL("../pages/MapPage.jsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../components/DirectionsRenderer.jsx", import.meta.url), "utf8");
const tripPanel = readFileSync(new URL("../components/TripPanel.jsx", import.meta.url), "utf8");
const transitDetails = readFileSync(new URL("../components/TransitDetails.jsx", import.meta.url), "utf8");
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

test("MapPage gives Google the mode-specific routing stops", () => {
  assert.match(
    mapPage,
    /const routingStops = useMemo\([\s\S]{0,100}selectRoutingStops\(trip, travelMode\)[\s\S]{0,60}\[trip, travelMode\]/,
  );
  assert.match(mapPage, /stops=\{routingStops\}/);
  assert.match(mapPage, /formatTransitScopeMessage\(trip, routingStops\)/);
});

test("MapPage uses explicit Google optimization instead of the active OSRM trip path", () => {
  assert.doesNotMatch(mapPage, /getRestaurants,\s*getTrip/);
  assert.doesNotMatch(mapPage, /planTrip\(/);
  assert.doesNotMatch(mapPage, /<TripPolyline/);
  assert.match(mapPage, /handleSuggestBestOrder/);
  assert.match(mapPage, /travelMode \|\| "DRIVING"/);
  assert.match(mapPage, /tripFingerprint/);
  assert.match(mapPage, /applyWaypointOrder/);
  assert.match(mapPage, /buildOptimizationComparison/);
  assert.match(mapPage, /buildArrivalTimeline/);
  assert.match(mapPage, /onOptimizationResult=\{handleOptimizationResult\}/);
  assert.match(mapPage, /onOptimizationError=\{handleOptimizationError\}/);
  assert.match(mapPage, /version="beta"/);
});

test("ordinary trip mutations preserve submitted order without optimizing", () => {
  for (const functionName of ["addStop", "addCustomStop", "reorderTrip", "removeStop", "editStop"]) {
    const start = mapPage.indexOf(`function ${functionName}`);
    assert.notEqual(start, -1, `${functionName} should exist`);
    const nextFunction = mapPage.indexOf("\n  function ", start + 10);
    const source = mapPage.slice(start, nextFunction === -1 ? mapPage.length : nextFunction);
    assert.match(source, /setTrip\(/);
    assert.doesNotMatch(source, /planTrip|handleSuggestBestOrder/);
  }
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

test("DirectionsRenderer optimizes an immutable Google request snapshot", () => {
  assert.match(renderer, /optimizationRequest/);
  assert.match(renderer, /const requestedStops = optimizationRequest\.stops/);
  assert.match(renderer, /const requestedMode = optimizationRequest\.mode/);
  assert.match(renderer, /optimizeWaypoints:\s*true/);
  assert.match(renderer, /waypoint_order/);
  assert.match(renderer, /onOptimizationResult/);
  assert.match(renderer, /onOptimizationError/);
});

test("multi-stop driving combines only distinct default and toll-free Google routes", () => {
  assert.match(renderer, /provideRouteAlternatives:\s*baseRequest\.waypoints\.length === 0/);
  assert.match(renderer, /mergeDrivingResults/);
  assert.match(renderer, /avoidTolls:\s*true/);
});

test("DirectionsRenderer reports normalized route details and provider warnings", () => {
  assert.match(renderer, /function routeMetrics/);
  assert.match(renderer, /normalizeLegMetrics/);
  assert.match(renderer, /const requestedAt = Date\.now\(\)/);
  assert.match(renderer, /tripFingerprint/);
  assert.match(renderer, /routeIndex/);
  assert.match(renderer, /onRouteDetails/);
  assert.match(renderer, /legDistancesMeters/);
  assert.match(renderer, /onWarnings/);
  assert.match(renderer, /onCopyrights/);
});

test("route-index changes clear stale route presentation while preserving option controls", () => {
  assert.match(mapPage, /useEffect\(\(\) => \{\s*setDirError\(null\);\s*setDirSummary\(null\);[\s\S]{0,180}\}, \[routeIndex\]\)/);
  assert.match(mapPage, /matchesTripIdentity\(identity, routingStops, travelMode, routeIndex\)/);
});

test("TripPanel renders a route-level status separate from summary", () => {
  assert.match(tripPanel, /routeMessage/);
  assert.match(tripPanel, /role="status"/);
  assert.match(tripPanel, /summary &&/);
});

test("TripPanel renders optimization, arrivals, warnings, and attribution", () => {
  assert.match(tripPanel, /optimizationLoading/);
  assert.match(tripPanel, /Finding best order…/);
  assert.match(tripPanel, /Suggest Best Order/);
  assert.match(tripPanel, /optimizationComparison\.message/);
  assert.match(tripPanel, /arrivalRows/);
  assert.match(tripPanel, /aria-live="polite"/);
  assert.match(tripPanel, /from previous stop/);
  assert.match(tripPanel, /from start/);
  assert.doesNotMatch(tripPanel, /distanceLabel\(s\.vendor\)/);
  assert.doesNotMatch(tripPanel, /Route notice:/);
  assert.match(tripPanel, /routeCopyrights/);
  assert.match(tripPanel, /travelMode === "TRANSIT"/);
});

test("TripPanel falls back to current hours when Google has no arrival row", () => {
  assert.match(tripPanel, /import \{ stopStatusPresentation \} from "\.\.\/lib\/tripOptimization"/);
  assert.match(tripPanel, /const statusPresentation = stopStatusPresentation\(s\.vendor, arrival\)/);
  assert.match(tripPanel, /const routeDistance = arrival\?\.legDistance/);
  assert.match(tripPanel, /statusPresentation &&/);
  assert.match(tripPanel, /ARRIVAL_TONE_CLASS\[statusPresentation\.tone\]/);
  assert.match(tripPanel, /\{statusPresentation\.text\}/);
});

test("TripPanel uses the same customer-facing image fallback as Discover", () => {
  assert.match(tripPanel, /import \{ vendorGallery, priceLabel \} from "\.\.\/lib\/vendorDisplay"/);
  assert.match(tripPanel, /src=\{vendorGallery\(s\.vendor\)\[0\]\}/);
  assert.doesNotMatch(tripPanel, /src=\{placeholderImage\(s\.vendor\)\}/);
});

test("VendorPanel uses the same customer-facing image fallback as Discover", () => {
  assert.match(vendorPanel, /vendorGallery/);
  assert.match(vendorPanel, /src=\{vendorGallery\(v\)\[0\]\}/);
  assert.doesNotMatch(vendorPanel, /src=\{placeholderImage\(v\)\}/);
});

test("empty Transit details wait silently for Google or the route error", () => {
  assert.match(transitDetails, /if \(!legs \|\| legs\.length === 0\) return null/);
  assert.doesNotMatch(transitDetails, /No transit routes here/);
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
