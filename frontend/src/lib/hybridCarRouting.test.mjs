import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const mapPage = read("../pages/MapPage.jsx");
const tripPanel = read("../components/TripPanel.jsx");
const directions = read("../components/DirectionsRenderer.jsx");

test("Car best order uses Express OSRM while its visible route remains Google", () => {
  assert.match(mapPage, /import \{ getRestaurants, getTrip \} from "\.\.\/api"/);
  assert.match(mapPage, /travelMode === "DRIVING"[\s\S]*getTrip\([\s\S]*true\)/);
  assert.match(mapPage, /applyFixedEndpointOrder/);
  assert.match(mapPage, /<DirectionsRenderer[\s\S]*stops=\{routingStops\}/);
  assert.match(directions, /if \(travelMode === "DRIVING"\)/);
  assert.match(directions, /avoidTolls:\s*true/);
  assert.match(directions, /provideRouteAlternatives/);
});

test("Car optimization is identity-safe and compares Google totals", () => {
  assert.match(mapPage, /optimizationIdRef\.current !== id/);
  assert.match(mapPage, /tripFingerprint\(tripRef\.current, "DRIVING"\)/);
  assert.match(mapPage, /pendingCarComparisonRef\.current/);
  assert.match(mapPage, /buildOptimizationComparison\(pending\.baseline, details\)/);
  assert.match(mapPage, /Couldn’t suggest an order for Car\. Your current order was kept\./);
  assert.match(mapPage, /const invalidateOptimization = useCallback\(\(\) => \{[\s\S]*setCarOptimizationLoading\(false\)/);
  assert.match(mapPage, /const handleCustomPlaceDetails = useCallback\(\(stopId, placeId, details\) => \{[\s\S]*invalidateOptimization\(\);[\s\S]*setTrip[\s\S]*\}, \[invalidateOptimization\]\)/);
});

test("reselecting the active Google route keeps the Car baseline available", () => {
  assert.match(mapPage, /function handleSelectRoute\(index\) \{\s*if \(index === routeIndex\) return;/);
});

test("best order waits for a Google baseline without adding a new visual panel", () => {
  assert.match(mapPage, /bestOrderDisabled=\{travelMode === "DRIVING" && !currentRouteMetrics\}/);
  assert.match(tripPanel, /bestOrderDisabled/);
  assert.match(tripPanel, /disabled=\{optimizationLoading \|\| bestOrderDisabled \|\| Boolean\(routeError\) \|\| travelMode === "TRANSIT"\}/);
  assert.doesNotMatch(tripPanel, /OSRM|hybrid routing|Google baseline/);
});
