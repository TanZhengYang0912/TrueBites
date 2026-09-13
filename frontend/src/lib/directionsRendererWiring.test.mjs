import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/DirectionsRenderer.jsx", import.meta.url), "utf8");

test("renderer publishes identity-safe Google leg details and attribution", () => {
  assert.match(source, /normalizeLegMetrics/);
  assert.match(source, /tripFingerprint/);
  assert.match(source, /legDistancesMeters/);
  assert.match(source, /legDurationsSeconds/);
  assert.match(source, /calculatedAt/);
  assert.match(source, /onRouteDetails/);
  assert.match(source, /onWarnings/);
  assert.match(source, /onCopyrights/);
  assert.match(source, /onError/);
});

test("optimization uses Google twice for the exact selected non-transit mode", () => {
  assert.match(source, /optimizationRequest/);
  assert.match(source, /requestedMode === "TRANSIT"/);
  assert.match(source, /optimizeWaypoints:\s*true/);
  assert.match(source, /onOptimizationResult/);
  assert.match(source, /onOptimizationError/);
  assert.match(source, /waypointOrder:\s*optimizedRoute\.waypoint_order/);
  assert.doesNotMatch(source, /travelMode:\s*google\.maps\.TravelMode\.DRIVING/);
});

test("route failure clears stale route data instead of inventing a duration", () => {
  assert.doesNotMatch(source, /duration:\s*"No route available"/);
  assert.match(source, /publishSummary\?\.\(null\)/);
  assert.match(source, /publishRoutes\?\.\(\[\]\)/);
  assert.match(source, /publishDetails\?\.\(null/);
  assert.match(source, /publishWarnings\?\.\(\[\]/);
  assert.match(source, /publishCopyrights\?\.\(""/);
});
