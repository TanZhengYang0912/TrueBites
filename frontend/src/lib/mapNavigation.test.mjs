import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mapPage = fs.readFileSync(new URL("../pages/MapPage.jsx", import.meta.url), "utf8");

test("map view leaves Discover navigation idle while keeping Map mode active", () => {
  assert.match(mapPage, /activeSection=\{null\}\s+mapActive/);
  assert.doesNotMatch(mapPage, /activeSection="discover"\s+mapActive/);
});
