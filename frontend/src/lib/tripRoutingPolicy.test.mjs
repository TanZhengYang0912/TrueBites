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
} from "./tripRoutingPolicy.js";

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

test("valid Google modes pass preflight while multi-stop transit does not", () => {
  assert.equal(getRouteConstraint("DRIVING", 27), null);
  assert.equal(getRouteConstraint("WALKING", 27), null);
  assert.equal(getRouteConstraint("TRANSIT", 2), null);
  assert.deepEqual(getRouteConstraint("TRANSIT", 4), {
    code: "TRANSIT_WAYPOINTS_UNSUPPORTED",
    message: "Transit routing supports only a start and destination. Remove 2 intermediate stops to calculate this route.",
  });
  assert.deepEqual(getRouteConstraint("TRANSIT", 3), {
    code: "TRANSIT_WAYPOINTS_UNSUPPORTED",
    message: "Transit routing supports only a start and destination. Remove 1 intermediate stop to calculate this route.",
  });
});

test("the global 27-stop cap takes precedence for oversized transit trips", () => {
  assert.equal(getRouteConstraint("TRANSIT", 35)?.code, "MAX_WAYPOINTS_EXCEEDED");
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
