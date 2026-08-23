import test from "node:test";
import assert from "node:assert/strict";
import { selectVisibleVendors, haversineKm } from "./mapVisibility.js";

const CENTRE = { lat: 2.1896, lng: 102.2501 };            // Melaka centre
const NEAR = { id: "a", latitude: 2.1953, longitude: 102.2480 };  // ~0.7 km away
const FAR = { id: "b", latitude: 2.4000, longitude: 102.4000 };   // ~29 km away
const NO_GEO = { id: "c", latitude: null, longitude: null };

const base = { anchor: CENTRE, radiusKm: 5, showAll: true, stopIds: new Set(), focusVendor: null };
const ids = (list) => list.map((v) => v.id);

test("haversineKm measures real ground distance", () => {
  assert.equal(haversineKm(2.1896, 102.2501, 2.1896, 102.2501), 0);
  const d = haversineKm(CENTRE.lat, CENTRE.lng, NEAR.latitude, NEAR.longitude);
  assert.ok(d > 0.5 && d < 0.9, `expected ~0.7 km, got ${d}`);
});

test("showAll includes every mapped vendor without an anchor", () => {
  const out = selectVisibleVendors({ ...base, vendors: [NEAR, FAR], anchor: null });
  assert.deepEqual(ids(out), ["a", "b"]);
});

test("showAll ignores the nearby radius", () => {
  const out = selectVisibleVendors({ ...base, vendors: [NEAR, FAR] });
  assert.deepEqual(ids(out), ["a", "b"]);
});

test("a trip stop stays visible even outside the radius", () => {
  const out = selectVisibleVendors({ ...base, vendors: [NEAR, FAR], stopIds: new Set(["b"]) });
  assert.deepEqual(ids(out), ["a", "b"]);
});

test("showAll false leaves only trip stops", () => {
  const out = selectVisibleVendors({ ...base, vendors: [NEAR, FAR], radiusKm: 50, showAll: false, stopIds: new Set(["b"]) });
  assert.deepEqual(ids(out), ["b"]);
});

test("vendors with no coordinates are never rendered, even as stops", () => {
  const out = selectVisibleVendors({ ...base, vendors: [NO_GEO], radiusKm: 100, stopIds: new Set(["c"]) });
  assert.deepEqual(out, []);
});

test("focusVendor is appended when out of range and never duplicated when in range", () => {
  const appended = selectVisibleVendors({ ...base, vendors: [NEAR, FAR], focusVendor: FAR });
  assert.deepEqual(ids(appended), ["a", "b"]);

  const notDuplicated = selectVisibleVendors({ ...base, vendors: [NEAR], focusVendor: NEAR });
  assert.deepEqual(ids(notDuplicated), ["a"]);
});

test("a vendor with only one of latitude/longitude null is excluded", () => {
  const noLat = { id: "d", latitude: null, longitude: 102.2480 };
  const noLng = { id: "e", latitude: 2.1953, longitude: null };
  const out = selectVisibleVendors({ ...base, vendors: [noLat, noLng], radiusKm: 100 });
  assert.deepEqual(out, []);
});

test("a focusVendor with a null coordinate is not appended", () => {
  const badFocus = { id: "f", latitude: null, longitude: 102.2480 };
  const out = selectVisibleVendors({ ...base, vendors: [NEAR], focusVendor: badFocus });
  assert.deepEqual(ids(out), ["a"]);
});
