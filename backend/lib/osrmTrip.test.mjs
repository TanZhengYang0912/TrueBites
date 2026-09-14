import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOsrmTripUrl,
  fetchOsrmTrip,
  parseOsrmTripResponse,
} from "./osrmTrip.js";

const points = [
  { lat: 2.19, lng: 102.25 },
  { lat: 2.20, lng: 102.24 },
  { lat: 2.21, lng: 102.26 },
  { lat: 2.22, lng: 102.27 },
];

const validTrip = {
  code: "Ok",
  waypoints: [
    { waypoint_index: 0 },
    { waypoint_index: 2 },
    { waypoint_index: 1 },
    { waypoint_index: 3 },
  ],
  trips: [{
    distance: 2450,
    duration: 540,
    geometry: { coordinates: [[102.25, 2.19], [102.27, 2.22]] },
  }],
};

test("optimized OSRM URL fixes the first source and last destination", () => {
  const url = buildOsrmTripUrl(points, true);
  assert.equal(url.pathname, "/trip/v1/driving/102.25,2.19;102.24,2.2;102.26,2.21;102.27,2.22");
  assert.equal(url.searchParams.get("source"), "first");
  assert.equal(url.searchParams.get("destination"), "last");
  assert.equal(url.searchParams.get("roundtrip"), "false");
  assert.equal(url.searchParams.get("overview"), "full");
  assert.equal(url.searchParams.get("geometries"), "geojson");
});

test("OSRM waypoint indexes become a complete route-order permutation", () => {
  assert.deepEqual(parseOsrmTripResponse(validTrip, points.length, true), {
    order: [0, 2, 1, 3],
    path: [{ lat: 2.19, lng: 102.25 }, { lat: 2.22, lng: 102.27 }],
    distance: "2.5 km",
    duration: "9 mins",
  });
});

test("malformed and endpoint-moving OSRM permutations are rejected", () => {
  for (const waypoints of [
    validTrip.waypoints.slice(0, 3),
    [{ waypoint_index: 0 }, { waypoint_index: 1 }, { waypoint_index: 1 }, { waypoint_index: 3 }],
    [{ waypoint_index: 1 }, { waypoint_index: 2 }, { waypoint_index: 0 }, { waypoint_index: 3 }],
    [{ waypoint_index: 0 }, { waypoint_index: 3 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
  ]) {
    assert.throws(
      () => parseOsrmTripResponse({ ...validTrip, waypoints }, points.length, true),
      /trip failed/,
    );
  }
  assert.throws(() => parseOsrmTripResponse({ code: "NoTrips" }, points.length, true), /trip failed/);
  assert.throws(
    () => parseOsrmTripResponse({
      ...validTrip,
      trips: [{ ...validTrip.trips[0], geometry: { coordinates: [[102.25, "bad-latitude"]] } }],
    }, points.length, true),
    /trip failed/,
  );
});

test("fetchOsrmTrip rejects invalid coordinates and non-OK HTTP responses", async () => {
  await assert.rejects(() => fetchOsrmTrip([{ lat: 2.19, lng: 102.25 }, { lat: NaN, lng: 102.27 }]), /trip failed/);
  for (const invalidPoint of [
    { lat: null, lng: 102.27 },
    { lat: 2.19, lng: null },
    { lat: "", lng: 102.27 },
    { lat: 2.19, lng: "" },
  ]) {
    assert.throws(() => buildOsrmTripUrl([points[0], invalidPoint]), /trip failed/);
    await assert.rejects(() => fetchOsrmTrip([points[0], invalidPoint]), /trip failed/);
  }
  await assert.rejects(
    () => fetchOsrmTrip(points, true, { fetchImpl: async () => ({ ok: false, status: 429 }) }),
    /trip failed/,
  );
});
