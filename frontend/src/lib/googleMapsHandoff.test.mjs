import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleMapsUrl } from "./googleMapsHandoff.js";

const stops = [
  { id: "me", isMe: true, lat: 3.1, lng: 101.7 },
  { id: "one", isMe: false, lat: 2.4, lng: 102.0 },
  { id: "two", isMe: false, lat: 2.3, lng: 102.1 },
  { id: "final", isMe: false, lat: 2.2, lng: 102.2 },
];

test("Transit handoff uses Your location and the actual final destination without waypoints", () => {
  const result = buildGoogleMapsUrl(stops, "TRANSIT");
  const url = new URL(result.url);

  assert.equal(url.searchParams.get("origin"), "3.1,101.7");
  assert.equal(url.searchParams.get("destination"), "2.2,102.2");
  assert.equal(url.searchParams.has("waypoints"), false);
  assert.equal(url.searchParams.get("travelmode"), "transit");
  assert.equal(result.truncated, false);
});

test("Driving handoff keeps the existing nine-stop cap", () => {
  const longTrip = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    lat: 2 + index / 100,
    lng: 102 + index / 100,
  }));
  const result = buildGoogleMapsUrl(longTrip, "DRIVING");
  const url = new URL(result.url);

  assert.equal(result.truncated, true);
  assert.equal(url.searchParams.get("destination"), "2.09,102.09");
  assert.equal(url.searchParams.get("waypoints").split("|").length, 8);
});
