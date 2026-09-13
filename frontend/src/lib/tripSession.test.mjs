import test from "node:test";
import assert from "node:assert/strict";

const tripStorage = await import("./tripStorage.js");

function installBrowserStorage() {
  const values = new Map();
  const listeners = new Map();
  const events = [];
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    dispatchEvent: (event) => {
      events.push(event.type);
      for (const listener of listeners.get(event.type) || []) listener(event);
    },
    addEventListener: (type, listener) => {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    removeEventListener: (type, listener) => {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener));
    },
  };
  return { values, events };
}

const storedVendor = {
  id: "vendor-stop-1", type: "vendor", vendorId: "vendor-1",
  name: "One", lat: 2.2, lng: 102.2,
};

test("guest trip is adopted by the first signed-in account", () => {
  installBrowserStorage();
  tripStorage.saveTrip([storedVendor], "DRIVING", "guest");
  assert.equal(tripStorage.reconcileTripOwner({ user: { id: "user-a" } }), "adopted");
  assert.equal(tripStorage.loadTrip("user:user-a").stops[0].vendorId, "vendor-1");
  assert.equal(tripStorage.loadTrip("user:user-a").travelMode, "DRIVING");
});

test("same-user auth refresh keeps the trip", () => {
  installBrowserStorage();
  tripStorage.saveTrip([storedVendor], "WALKING", "user:user-a");
  assert.equal(tripStorage.reconcileTripOwner({ user: { id: "user-a" } }), "kept");
  assert.equal(tripStorage.loadTrip("user:user-a").stops.length, 1);
});

test("logout and account switch clear the previous account trip", () => {
  installBrowserStorage();
  tripStorage.saveTrip([storedVendor], "DRIVING", "user:user-a");
  assert.equal(tripStorage.reconcileTripOwner(null), "cleared");
  assert.equal(tripStorage.loadTrip("guest"), null);
  tripStorage.saveTrip([storedVendor], "DRIVING", "user:user-a");
  assert.equal(tripStorage.reconcileTripOwner({ user: { id: "user-b" } }), "cleared");
  assert.equal(tripStorage.loadTrip("user:user-b"), null);
});

test("Saved and My reviews append a vendor occurrence in the current record shape", () => {
  installBrowserStorage();
  const vendor = { id: "db-1", name: "Kedai", latitude: 2.2, longitude: 102.2 };
  assert.equal(tripStorage.addVendorToTrip(vendor, "guest"), "added");
  assert.equal(tripStorage.addVendorToTrip(vendor, "guest"), "added", "repeat add is allowed");
  const stops = tripStorage.loadTrip("guest").stops;
  assert.deepEqual(stops.map((stop) => [stop.type, stop.vendorId]), [["vendor", "db-1"], ["vendor", "db-1"]]);
  assert.notEqual(stops[0].id, stops[1].id);
  assert.equal(tripStorage.addVendorToTrip({ id: "x", name: "No pin" }, "guest"), "no-location");
});

test("outside-map adds reserve the anchor row inside the 27-stop cap", () => {
  installBrowserStorage();
  const vendor = { id: "db-1", name: "Kedai", latitude: 2.2, longitude: 102.2 };
  for (let index = 0; index < 26; index += 1) assert.equal(tripStorage.addVendorToTrip(vendor, "guest"), "added");
  assert.equal(tripStorage.addVendorToTrip(vendor, "guest"), "limit", "26 vendors + the anchor row = 27");
  assert.equal(tripStorage.loadTrip("guest").stops.length, 26);
  const counts = [];
  tripStorage.subscribePlannedStopCount((count) => counts.push(count), "guest")();
  assert.deepEqual(counts, [27]);
});

test("durable trip storage excludes the precise anchor and custom display snapshots", () => {
  const { values } = installBrowserStorage();
  const anchor = { id: "anchor-1", type: "anchor", name: "Private home", lat: 3.1, lng: 101.7 };
  const custom = {
    id: "custom-1", type: "custom", name: "Cafe Example", lat: 2.2, lng: 102.2,
    placeId: "google-place-1", cachedAt: 1_800_000_000_000,
    address: "Private display snapshot", priceLabel: "RM15 – RM30", primaryType: "cafe",
  };
  tripStorage.saveTrip([anchor, storedVendor, custom], "WALKING", "guest");
  const payload = JSON.parse(values.get("truebites:trip"));
  assert.deepEqual(payload.stops, [
    storedVendor,
    {
      id: "custom-1", type: "custom", placeId: "google-place-1",
      lat: 2.2, lng: 102.2, cachedAt: 1_800_000_000_000,
    },
  ]);
  assert.equal(JSON.stringify(payload).includes("Private home"), false);
  assert.equal(JSON.stringify(payload).includes("Private display snapshot"), false);
});

test("expired or unidentified custom Google stops are removed during restore", () => {
  const { values } = installBrowserStorage();
  const now = Date.now();
  values.set("truebites:trip", JSON.stringify({
    owner: "guest",
    travelMode: "DRIVING",
    stops: [
      storedVendor,
      { id: "fresh", type: "custom", placeId: "place-fresh", lat: 2.2, lng: 102.2, cachedAt: now },
      { id: "expired", type: "custom", placeId: "place-old", lat: 2.2, lng: 102.2, cachedAt: now - (31 * 24 * 60 * 60 * 1000) },
      { id: "anonymous", type: "custom", lat: 2.2, lng: 102.2, cachedAt: now },
    ],
  }));
  assert.deepEqual(tripStorage.loadTrip("guest").stops.map((stop) => stop.id), ["vendor-stop-1", "fresh"]);
});
