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
