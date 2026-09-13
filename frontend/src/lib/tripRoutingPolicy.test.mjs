import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_GOOGLE_TRIP_STOPS,
  TRIP_LIMIT_ADD_MESSAGE,
  EMPTY_ROUTE_SUMMARY,
  isTripAtLimit,
  formatTripOverflowMessage,
  getRouteConstraint,
  getDirectionsErrorMessage,
  selectRoutingStops,
  formatTransitScopeMessage,
} from "./tripRoutingPolicy.js";

const routeStops = [
  { id: "me", type: "anchor", lat: 3.1, lng: 101.7 },
  { id: "middle-a", type: "vendor", lat: 2.4, lng: 102.0 },
  { id: "middle-b", type: "custom", lat: 2.3, lng: 102.1 },
  { id: "final", type: "vendor", lat: 2.2, lng: 102.2 },
];

test("capacity counts origin and destination", () => {
  assert.equal(MAX_GOOGLE_TRIP_STOPS, 27);
  assert.equal(isTripAtLimit(26), false);
  assert.equal(isTripAtLimit(27), true);
  assert.equal(
    TRIP_LIMIT_ADD_MESSAGE,
    "A trip can include up to 27 stops for Google routing. Remove a stop before adding another.",
  );
});

test("a restored 35-stop trip is preserved but reports eight excess stops", () => {
  assert.equal(formatTripOverflowMessage(27), null);
  assert.equal(
    formatTripOverflowMessage(35),
    "This trip has 35 stops. Google routing supports up to 27. Remove 8 stops to calculate the route.",
  );
  assert.deepEqual(getRouteConstraint("DRIVING", 35), {
    code: "MAX_WAYPOINTS_EXCEEDED",
    message: "This trip has 35 stops. Google routing supports up to 27. Remove 8 stops to calculate the route.",
  });
});

test("valid Google modes, including multi-stop transit scope, pass preflight", () => {
  assert.equal(getRouteConstraint("DRIVING", 27), null);
  assert.equal(getRouteConstraint("WALKING", 27), null);
  assert.equal(getRouteConstraint("TRANSIT", 2), null);
  assert.equal(getRouteConstraint("TRANSIT", 27), null);
});

test("the global 27-stop cap takes precedence for oversized transit trips", () => {
  assert.equal(getRouteConstraint("TRANSIT", 35)?.code, "MAX_WAYPOINTS_EXCEEDED");
});

test("transit routes from Your location to the final non-start stop", () => {
  assert.equal(selectRoutingStops(routeStops, "DRIVING"), routeStops);
  assert.deepEqual(
    selectRoutingStops(routeStops, "TRANSIT").map((stop) => stop.id),
    ["me", "final"],
  );

  const misplacedOrigin = [routeStops[1], routeStops[0], routeStops[2], routeStops[3]];
  assert.deepEqual(
    selectRoutingStops(misplacedOrigin, "TRANSIT").map((stop) => stop.id),
    ["me", "final"],
  );
});

test("transit falls back to the first stop and rejects a missing destination", () => {
  const withoutOrigin = routeStops.slice(1);
  assert.deepEqual(
    selectRoutingStops(withoutOrigin, "TRANSIT").map((stop) => stop.id),
    ["middle-a", "final"],
  );
  assert.deepEqual(selectRoutingStops([], "TRANSIT"), []);
  assert.deepEqual(selectRoutingStops([routeStops[0]], "TRANSIT"), [routeStops[0]]);
});

test("transit scope copy reports only omitted intermediate stops", () => {
  const selected = selectRoutingStops(routeStops, "TRANSIT");
  assert.equal(
    formatTransitScopeMessage(routeStops, selected),
    "Transit route includes only the start and final destination. 2 intermediate stops are not included.",
  );
  assert.equal(formatTransitScopeMessage(routeStops.slice(0, 2), routeStops.slice(0, 2)), null);
});

test("Google failures map to exact messages", () => {
  assert.equal(getDirectionsErrorMessage(null, 2), null);
  assert.equal(getDirectionsErrorMessage({ code: "ZERO_RESULTS" }, 2), "No route was found for these stops.");
  assert.equal(
    getDirectionsErrorMessage(new Error("REQUEST_DENIED"), 2),
    "Google routing is unavailable. Please check the Maps API configuration.",
  );
  assert.equal(
    getDirectionsErrorMessage("OVER_QUERY_LIMIT", 2),
    "Google routing is temporarily unavailable. Please try again shortly.",
  );
  assert.equal(getDirectionsErrorMessage(new Error("network"), 2), "Route calculation failed. Please try again.");
});

test("an unavailable route never pretends to have a duration", () => {
  assert.deepEqual(EMPTY_ROUTE_SUMMARY, { distance: "—", duration: "—" });
});
