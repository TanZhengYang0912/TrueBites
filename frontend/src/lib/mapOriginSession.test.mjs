import test from "node:test";
import assert from "node:assert/strict";
import {
  clearMapOrigin,
  createMapOriginSessionBoundary,
  loadMapOrigin,
  saveMapOrigin,
  subscribeMapOriginClear,
} from "./mapOriginSession.js";

function installSessionStorage() {
  const values = new Map();
  const listeners = new Map();
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    dispatchEvent: (event) => {
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
  return values;
}

test("map origin keeps only validated coordinates in the current tab", () => {
  const values = installSessionStorage();

  saveMapOrigin({ lat: 3.2175, lng: 101.7334, label: "Private address" });

  assert.deepEqual(loadMapOrigin(), { lat: 3.2175, lng: 101.7334 });
  assert.equal(values.get("truebites:map-origin").includes("label"), false);
  assert.equal(values.get("truebites:map-origin").includes("Private address"), false);

  clearMapOrigin();
  assert.equal(loadMapOrigin(), null);
});

test("clearing persisted origin also clears mounted same-tab state", () => {
  installSessionStorage();
  let notifications = 0;
  const unsubscribe = subscribeMapOriginClear(() => { notifications += 1; });

  clearMapOrigin();
  assert.equal(notifications, 1);

  unsubscribe();
  clearMapOrigin();
  assert.equal(notifications, 1);
});

test("map origin rejects corrupt, non-numeric, and out-of-range coordinates", () => {
  const values = installSessionStorage();
  for (const payload of [
    "not-json",
    JSON.stringify({ lat: "3.2", lng: 101.7 }),
    JSON.stringify({ lat: null, lng: 101.7 }),
    JSON.stringify({ lat: 91, lng: 101.7 }),
    JSON.stringify({ lat: 3.2, lng: -181 }),
  ]) {
    values.set("truebites:map-origin", payload);
    assert.equal(loadMapOrigin(), null);
  }
});

test("location survives Guest login but clears on logout or account switch", () => {
  let clears = 0;
  const observe = createMapOriginSessionBoundary(() => { clears += 1; });

  assert.equal(observe(null), false);
  assert.equal(observe({ user: { id: "user-a" } }), false, "Guest login preserves this tab's location");
  assert.equal(observe({ user: { id: "user-a" } }), false);
  assert.equal(observe(null), true, "logout clears the signed-in user's location");
  assert.equal(clears, 1);

  const switchAccount = createMapOriginSessionBoundary(() => { clears += 1; });
  assert.equal(switchAccount({ user: { id: "user-a" } }), false);
  assert.equal(switchAccount({ user: { id: "user-b" } }), true, "account switch clears the previous user's location");
  assert.equal(clears, 2);
});
