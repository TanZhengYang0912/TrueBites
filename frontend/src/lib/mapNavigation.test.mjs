import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mapPage = fs.readFileSync(new URL("../pages/MapPage.jsx", import.meta.url), "utf8");

// The List/Map toggle is gone; Discover and Map are ordinary nav links now, so
// the map view marks itself active by naming its own section instead.
test("map view highlights Map in the nav, not Discover", () => {
  assert.match(mapPage, /activeSection="map"/);
  assert.doesNotMatch(mapPage, /mapActive/);
});
