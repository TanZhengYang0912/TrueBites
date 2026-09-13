import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleMapsUrl } from "./googleMapsHandoff.js";

const stops = [
  { id: "start", type: "anchor", lat: 2.1, lng: 102.1 },
  { id: "middle", type: "vendor", lat: 2.2, lng: 102.2 },
  { id: "end", type: "custom", lat: 2.3, lng: 102.3 },
];

test("Transit handoff includes only anchor and final destination", () => {
  const result = buildGoogleMapsUrl(stops, "TRANSIT");
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("origin"), "2.1,102.1");
  assert.equal(url.searchParams.get("destination"), "2.3,102.3");
  assert.equal(url.searchParams.get("travelmode"), "transit");
  assert.equal(url.searchParams.has("waypoints"), false);
  assert.equal(result.truncated, false);
});

test("Driving and Walking preserve the selected stop order", () => {
  const driving = new URL(buildGoogleMapsUrl(stops, "DRIVING").url);
  assert.equal(driving.searchParams.get("waypoints"), "2.2,102.2");
  assert.equal(driving.searchParams.get("travelmode"), "driving");
  const walking = new URL(buildGoogleMapsUrl(stops, "WALKING").url);
  assert.equal(walking.searchParams.get("waypoints"), "2.2,102.2");
  assert.equal(walking.searchParams.get("travelmode"), "walking");
});

test("Google handoff reports truncation beyond nine post-origin stops", () => {
  const many = Array.from({ length: 11 }, (_, index) => ({
    id: String(index), type: index === 0 ? "anchor" : "vendor", lat: 2 + index / 100, lng: 102,
  }));
  const result = buildGoogleMapsUrl(many, "DRIVING");
  assert.equal(result.truncated, true);
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("destination"), "2.09,102");
  assert.equal(url.searchParams.get("waypoints").split("|").length, 8);
});

test("handoff requires at least two route stops", () => {
  assert.equal(buildGoogleMapsUrl([], "DRIVING"), null);
  assert.equal(buildGoogleMapsUrl(stops.slice(0, 1), "WALKING"), null);
});
