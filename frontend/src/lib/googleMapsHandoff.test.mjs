import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleMapsUrl } from "./googleMapsHandoff.js";

const stops = [
  { id: "start", type: "anchor", lat: 2.1, lng: 102.1 },
  { id: "middle", type: "vendor", lat: 2.2, lng: 102.2 },
  { id: "end", type: "custom", lat: 2.3, lng: 102.3 },
];

const manyStops = (count) => Array.from({ length: count }, (_, index) => ({
  id: String(index),
  type: index === 0 ? "anchor" : "vendor",
  lat: 2 + index / 100,
  lng: 102,
}));

test("Transit handoff includes only anchor and final destination", () => {
  const result = buildGoogleMapsUrl(stops, "TRANSIT");
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("origin"), "2.1,102.1");
  assert.equal(url.searchParams.get("destination"), "2.3,102.3");
  assert.equal(url.searchParams.get("travelmode"), "transit");
  assert.equal(url.searchParams.has("waypoints"), false);
  assert.equal(result.truncated, false);
  assert.equal(result.includedCount, 2);
  assert.equal(result.remainingCount, 0);
});

test("Driving and Walking preserve the selected stop order", () => {
  const drivingResult = buildGoogleMapsUrl(stops, "DRIVING");
  const driving = new URL(drivingResult.url);
  assert.equal(driving.searchParams.get("waypoints"), "2.2,102.2");
  assert.equal(driving.searchParams.get("travelmode"), "driving");
  assert.deepEqual(
    { truncated: drivingResult.truncated, includedCount: drivingResult.includedCount, remainingCount: drivingResult.remainingCount },
    { truncated: false, includedCount: 3, remainingCount: 0 },
  );
  const walkingResult = buildGoogleMapsUrl(stops, "WALKING");
  const walking = new URL(walkingResult.url);
  assert.equal(walking.searchParams.get("waypoints"), "2.2,102.2");
  assert.equal(walking.searchParams.get("travelmode"), "walking");
  assert.deepEqual(
    { truncated: walkingResult.truncated, includedCount: walkingResult.includedCount, remainingCount: walkingResult.remainingCount },
    { truncated: false, includedCount: 3, remainingCount: 0 },
  );
});

test("non-Transit handoff opens the first seven total stops in Trip order", () => {
  const result = buildGoogleMapsUrl(manyStops(12), "DRIVING");
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("origin"), "2,102");
  assert.equal(url.searchParams.get("destination"), "2.06,102");
  assert.deepEqual(url.searchParams.get("waypoints").split("|"), [
    "2.01,102", "2.02,102", "2.03,102", "2.04,102", "2.05,102",
  ]);
  assert.deepEqual(
    { truncated: result.truncated, includedCount: result.includedCount, remainingCount: result.remainingCount },
    { truncated: true, includedCount: 7, remainingCount: 5 },
  );
});

test("handoff metadata reports exact seven-stop boundaries", () => {
  assert.deepEqual(
    [7, 8, 12, 31].map((count) => {
      const result = buildGoogleMapsUrl(manyStops(count), "WALKING");
      return [result.truncated, result.includedCount, result.remainingCount];
    }),
    [[false, 7, 0], [true, 7, 1], [true, 7, 5], [true, 7, 24]],
  );
});

test("handoff requires at least two route stops", () => {
  assert.equal(buildGoogleMapsUrl([], "DRIVING"), null);
  assert.equal(buildGoogleMapsUrl(stops.slice(0, 1), "WALKING"), null);
});
