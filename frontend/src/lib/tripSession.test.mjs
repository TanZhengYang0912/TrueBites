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

test("trip storage exposes account-boundary helpers", () => {
  assert.equal(typeof tripStorage.tripOwner, "function");
  assert.equal(typeof tripStorage.clearTrip, "function");
  assert.equal(typeof tripStorage.createTripSessionBoundary, "function");
});

test("tripOwner distinguishes guests and every signed-in account", () => {
  if (!tripStorage.tripOwner) return;
  assert.equal(tripStorage.tripOwner(null), "guest");
  assert.equal(tripStorage.tripOwner({ user: { id: "user-a" } }), "user:user-a");
  assert.equal(tripStorage.tripOwner({ user: { id: "user-b" } }), "user:user-b");
});

test("a stored trip loads only for the same guest or account owner", () => {
  if (!tripStorage.tripOwner) return;
  const { values } = installBrowserStorage();
  const stop = { id: "vendor-1", name: "One", lat: 2.2, lng: 102.2 };

  tripStorage.saveTrip([stop], "DRIVING", "user:user-a");
  assert.equal(tripStorage.loadTrip("user:user-a").stops.length, 1);
  assert.equal(tripStorage.loadTrip("user:user-b"), null);
  assert.equal(values.has("truebites:trip"), false);

  values.set("truebites:trip", JSON.stringify({ stops: [stop], travelMode: null }));
  assert.equal(tripStorage.loadTrip("guest"), null, "legacy ownerless trips must not leak forward");
});

test("trip persistence never stores the session-only current location", () => {
  const { values } = installBrowserStorage();
  const currentLocation = { id: "__me__", name: "Private address", lat: 2.2, lng: 102.2, isMe: true };
  const vendor = { id: "vendor-1", name: "One", lat: 2.21, lng: 102.21, isMe: false };

  tripStorage.saveTrip([currentLocation, vendor], "DRIVING", "user:user-a");

  const persisted = JSON.parse(values.get("truebites:trip"));
  assert.deepEqual(persisted.stops.map((stop) => stop.id), ["vendor-1"]);
  assert.equal(JSON.stringify(persisted).includes("Private address"), false);
  assert.deepEqual(tripStorage.loadTrip("user:user-a").stops.map((stop) => stop.id), ["vendor-1"]);
});

test("loading a legacy trip removes a previously persisted current location", () => {
  const { values } = installBrowserStorage();
  const currentLocation = { id: "__me__", name: "Private address", lat: 2.2, lng: 102.2, isMe: true };
  const vendor = { id: "vendor-1", name: "One", lat: 2.21, lng: 102.21, isMe: false };
  values.set("truebites:trip", JSON.stringify({
    owner: "user:user-a",
    stops: [currentLocation, vendor],
    travelMode: "DRIVING",
  }));

  assert.deepEqual(tripStorage.loadTrip("user:user-a").stops.map((stop) => stop.id), ["vendor-1"]);
  assert.equal(values.get("truebites:trip").includes("Private address"), false);
});

test("custom Google stops persist identity but not Google display details", () => {
  const { values } = installBrowserStorage();
  const cachedAt = Date.now();
  const custom = {
    id: "custom-1",
    name: "Cafe Example",
    lat: 2.201,
    lng: 102.251,
    isMe: false,
    source: "custom",
    placeId: "google-place-1",
    cachedAt,
    address: "Google-provided address",
    primaryType: "cafe",
    priceLabel: "RM15 – RM30",
    vendor: { id: "not-a-vendor" },
    unrelated: "must-not-persist",
  };

  tripStorage.saveTrip([custom], "DRIVING", "user:user-a");

  const persisted = JSON.parse(values.get("truebites:trip"));
  assert.deepEqual(persisted.stops, [{
    id: "custom-1",
    lat: 2.201,
    lng: 102.251,
    isMe: false,
    source: "custom",
    placeId: "google-place-1",
    cachedAt,
  }]);
  assert.equal(JSON.stringify(persisted).includes("Google-provided address"), false);
  assert.equal(JSON.stringify(persisted).includes("RM15"), false);
});

test("expired Google coordinate caches and legacy custom stops without Place IDs are removed", () => {
  const { values } = installBrowserStorage();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  values.set("truebites:trip", JSON.stringify({
    owner: "user:user-a",
    travelMode: "DRIVING",
    stops: [
      { id: "expired", name: "Expired", lat: 2.2, lng: 102.2, source: "custom", placeId: "p-old", cachedAt: now - (30 * day) - 1 },
      { id: "fresh", name: "Fresh", lat: 2.21, lng: 102.21, source: "custom", placeId: "p-new", cachedAt: now - (30 * day) },
      { id: "legacy", name: "Legacy", lat: 2.22, lng: 102.22, source: "custom", placeId: "p-legacy" },
      { id: "unrefreshable", name: "Old Google content", lat: 2.23, lng: 102.23, source: "custom" },
    ],
  }));

  const loaded = tripStorage.loadTrip("user:user-a");

  assert.deepEqual(loaded.stops.map((stop) => stop.id), ["fresh", "legacy"]);
  assert.equal(Number.isFinite(loaded.stops.find((stop) => stop.id === "legacy").cachedAt), true);
  assert.equal(JSON.stringify(loaded).includes("Old Google content"), false);
  assert.deepEqual(JSON.parse(values.get("truebites:trip")).stops.map((stop) => stop.id), ["fresh", "legacy"]);
});

test("auth boundary clears only when identity changes, not on reload or token refresh", () => {
  if (!tripStorage.createTripSessionBoundary) return;
  let clears = 0;
  const observe = tripStorage.createTripSessionBoundary(() => { clears += 1; });

  assert.equal(observe({ user: { id: "user-a" } }), false, "initial hydration keeps the current trip");
  assert.equal(observe({ user: { id: "user-a" } }), false, "same-account auth events keep it");
  assert.equal(observe(null), true, "logout clears it");
  assert.equal(observe(null), false, "duplicate signed-out events do not clear twice");
  assert.equal(observe({ user: { id: "user-b" } }), true, "guest to login clears it");
  assert.equal(observe({ user: { id: "user-a" } }), true, "account switch clears it");
  assert.equal(clears, 3);
});

test("clearTrip removes persistence and updates same-tab subscribers", () => {
  if (!tripStorage.clearTrip) return;
  const { values, events } = installBrowserStorage();
  const stop = { id: "vendor-1", name: "One", lat: 2.2, lng: 102.2 };
  tripStorage.saveTrip([stop], null, "guest");
  const counts = [];
  const unsubscribe = tripStorage.subscribeTripCount((count) => counts.push(count), "guest");

  tripStorage.clearTrip();

  assert.equal(values.has("truebites:trip"), false);
  assert.equal(counts.at(-1), 0);
  assert.ok(events.includes("truebites:trip-changed"));
  unsubscribe();
});

test("outside-map vendor additions enforce the Google trip capacity", () => {
  installBrowserStorage();
  const stops = Array.from({ length: 27 }, (_, index) => ({
    id: `stop-${index}`,
    name: `Stop ${index}`,
    lat: 2.2 + index / 1000,
    lng: 102.2 + index / 1000,
  }));
  tripStorage.saveTrip(stops, "DRIVING", "guest");

  const result = tripStorage.addVendorToTrip({
    id: "vendor-28",
    name: "Twenty Eight",
    latitude: 2.3,
    longitude: 102.3,
  });

  assert.equal(result, "limit");
  assert.equal(tripStorage.loadTrip("guest").stops.length, 27);
});

test("outside-map vendor additions still allow the twenty-seventh stop", () => {
  installBrowserStorage();
  const stops = Array.from({ length: 26 }, (_, index) => ({
    id: `stop-${index}`,
    name: `Stop ${index}`,
    lat: 2.2 + index / 1000,
    lng: 102.2 + index / 1000,
  }));
  tripStorage.saveTrip(stops, "DRIVING", "guest");

  const result = tripStorage.addVendorToTrip({
    id: "vendor-27",
    name: "Twenty Seven",
    latitude: 2.3,
    longitude: 102.3,
  });

  assert.equal(result, "added");
  assert.equal(tripStorage.loadTrip("guest").stops.length, 27);
});
