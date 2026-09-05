import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const guestPrompt = read("../components/discovery/GuestPrompt.jsx");
const header = read("../components/discovery/DiscoveryHeader.jsx");

test("the guest prompt escapes any filtered ancestor", () => {
  assert.match(guestPrompt, /createPortal/, "GuestPrompt is not portalled out of its parent");
  assert.match(guestPrompt, /document\.body/, "GuestPrompt is not portalled to the body");
  assert.match(header, /backdrop-blur/, "the header's blur was removed instead of fixing the prompt");
});

test("all five filter controls share one row and Clear all sits below them", () => {
  const advancedFilters = read("../components/discovery/AdvancedFilters.jsx");
  assert.match(advancedFilters, /xl:grid-cols-5/, "the panel grid is not five columns wide");
  assert.doesNotMatch(advancedFilters, /xl:col-span-2/, "Availability still spans two columns");
  assert.doesNotMatch(advancedFilters, /places found/, "the result count line is still there");
});

test("the map header outranks the map's own overlays", () => {
  const mapPage = read("../pages/MapPage.jsx");
  const mapPanel = read("../components/MapPanel.jsx");

  assert.doesNotMatch(
    mapPage,
    /absolute inset-x-0 top-0 z-10/,
    "the header wrapper is still z-10, below the map panel",
  );
  assert.match(mapPage, /absolute inset-x-0 top-0 z-30/, "the header wrapper was not raised to z-30");
  assert.match(mapPanel, /z-20/, "MapPanel's z-index changed; re-check that the header still outranks it");
});
