import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const markerPath = new URL("../components/VendorMarkers.jsx", import.meta.url);

test("approximate vendor pins do not render a separate uncertainty radius", async () => {
  const source = await readFile(markerPath, "utf8");

  assert.match(source, /isApproximate \? "\?" : ""/);
  assert.doesNotMatch(source, /isApproximate &&\s*\(\s*<Circle/);
  assert.doesNotMatch(source, /radius=\{800\}/);
});

test("marker refs update clusters without rerendering through an inline ref", async () => {
  const source = await readFile(markerPath, "utf8");

  assert.match(source, /useAdvancedMarkerRef/);
  assert.match(source, /function VendorMarker/);
  assert.doesNotMatch(source, /ref=\{\(marker\) => setMarkerRef/);
});
