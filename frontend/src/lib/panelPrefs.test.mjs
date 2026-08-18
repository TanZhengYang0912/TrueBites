import test from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage stand-in — the helper only needs getItem/setItem.
function withStorage(store, fn) {
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
  };
  try { return fn(); } finally { globalThis.window = previous; }
}

<<<<<<< Updated upstream
const { loadNearbyCollapsed, saveNearbyCollapsed } = await import("./panelPrefs.js");

test("defaults to expanded when nothing is stored", () => {
  withStorage({}, () => assert.equal(loadNearbyCollapsed(), false));
});

test("round-trips a collapsed preference", () => {
  const store = {};
  withStorage(store, () => {
    saveNearbyCollapsed(true);
    assert.equal(loadNearbyCollapsed(), true);
    saveNearbyCollapsed(false);
    assert.equal(loadNearbyCollapsed(), false);
  });
});

test("treats unparseable stored values as expanded", () => {
  withStorage({ "truebites:panel": "not json" }, () => {
    assert.equal(loadNearbyCollapsed(), false);
  });
});

test("never throws when storage is unavailable", () => {
  const previous = globalThis.window;
  globalThis.window = undefined;
  try {
    assert.equal(loadNearbyCollapsed(), false);
    assert.doesNotThrow(() => saveNearbyCollapsed(true));
=======
const { loadPanelTab, savePanelTab } = await import("./panelPrefs.js");

test("panel tab defaults to trip", () => {
  withStorage({}, () => assert.equal(loadPanelTab(), "trip"));
});

test("round-trips the vendors tab", () => {
  const store = {};
  withStorage(store, () => {
    savePanelTab("vendors");
    assert.equal(loadPanelTab(), "vendors");
    savePanelTab("trip");
    assert.equal(loadPanelTab(), "trip");
  });
});

test("an unrecognised stored tab falls back to trip", () => {
  withStorage({ "truebites:panel": JSON.stringify({ tab: "nonsense" }) }, () => {
    assert.equal(loadPanelTab(), "trip");
  });
});

test("treats unparseable stored values as the trip tab", () => {
  withStorage({ "truebites:panel": "not json" }, () => {
    assert.equal(loadPanelTab(), "trip");
  });
});

test("panel tab never throws when storage is unavailable", () => {
  const previous = globalThis.window;
  globalThis.window = undefined;
  try {
    assert.equal(loadPanelTab(), "trip");
    assert.doesNotThrow(() => savePanelTab("vendors"));
>>>>>>> Stashed changes
  } finally {
    globalThis.window = previous;
  }
});
