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
