import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const markerPath = new URL("../components/VendorMarkers.jsx", import.meta.url);

test("all vendor precision values use one Hawker Stall pin", async () => {
  const source = await readFile(markerPath, "utf8");

  assert.match(source, /function HawkerStallPin/);
  assert.match(source,
    /const fill = selected \|\| numbered \? MAP_COLORS\.terracotta : MAP_COLORS\.forest/);
  assert.match(source, /<HawkerStallPin selected=\{isSelected\} stopNum=\{stopNum\} \/>/);
  assert.doesNotMatch(source, /\bisApproximate\b/);
  assert.doesNotMatch(source, /location_precision/);
  assert.doesNotMatch(source, /Approximate location/);
  assert.doesNotMatch(source, /glyph=.*"\?"/);
});

test("trip stops keep their route number in the same marker shape", async () => {
  const source = await readFile(markerPath, "utf8");

  assert.match(source, /<text[\s\S]*?\{stopNum\}[\s\S]*?<\/text>/);
  assert.match(source,
    /userStopNumber\s*\?\s*<HawkerStallPin stopNum=\{userStopNumber\} \/>/);
});

test("Google custom stops render as numbered route markers outside vendor clusters", async () => {
  const source = await readFile(markerPath, "utf8");

  assert.match(source, /function CustomStopMarker/);
  assert.match(source, /position=\{\{ lat: stop\.lat, lng: stop\.lng \}\}/);
  assert.match(source, /title=\{stop\.address \|\| stop\.name \|\| "Google place"\}/);
  assert.match(source, /<HawkerStallPin stopNum=\{stop\.stopNum\} \/>/);
  assert.match(source, /customStops\.map\(\(stop\) =>/);
  const customMarker = source.slice(
    source.indexOf("function CustomStopMarker"),
    source.indexOf("export default function VendorMarkers"),
  );
  assert.doesNotMatch(customMarker, /setClusterMarker|onMarkerChange/);
});

test("marker refs update clusters without rerendering through an inline ref", async () => {
  const source = await readFile(markerPath, "utf8");

  assert.match(source, /useAdvancedMarkerRef/);
  assert.match(source, /function VendorMarker/);
  assert.doesNotMatch(source, /ref=\{\(marker\) => setMarkerRef/);
});

test("map clusters use one brand-green renderer and do not render a nearby radius", async () => {
  const source = await readFile(markerPath, "utf8");

  assert.match(source, /function createBrandClusterRenderer/);
  assert.match(source, /renderer:\s*createBrandClusterRenderer\(\)/);
  assert.match(source, /fillColor:\s*MAP_COLORS\.forest/);
  assert.doesNotMatch(source, /\bCircle\b/);
  assert.doesNotMatch(source, /radiusCenter/);
  assert.doesNotMatch(source, /radiusKm/);
});
