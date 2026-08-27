import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { filterAdminMapVendors, isMelakaCoordinate } from "./adminMap.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("admin vendors can switch to a draggable pin map", () => {
  const page = read("../pages/admin/AdminVendorManagementPage.jsx");
  const map = read("../components/admin/AdminVendorMap.jsx");

  assert.match(page, /AdminVendorMap/);
  assert.match(page, /fetchAllPages/);
  assert.match(page, /viewMode/);
  assert.match(page, /onDragEnd/);
  assert.match(map, /APIProvider/);
  assert.match(map, /AdvancedMarker/);
  assert.match(map, /draggable/);
  assert.match(map, /onDragEnd/);
});

test("admin map keeps the camera focused on Melaka data", () => {
  const vendors = [
    { id: "melaka", latitude: 2.2, longitude: 102.25 },
    { id: "outlier", latitude: 6.2, longitude: 3.35 },
    { id: "missing", latitude: null, longitude: null },
  ];

  assert.equal(isMelakaCoordinate({ lat: 2.2, lng: 102.25 }), true);
  assert.equal(isMelakaCoordinate({ lat: 6.2, lng: 3.35 }), false);
  const result = filterAdminMapVendors(vendors);
  assert.deepEqual(result.mapped.map(({ vendor }) => vendor), [vendors[0]]);
  assert.deepEqual(result.excluded, {
    outsideMelaka: 1,
    missingCoordinates: 1,
  });
});

test("admin map component uses a deliberate Melaka camera and clusters all mapped pins", () => {
  const map = read("../components/admin/AdminVendorMap.jsx");

  assert.match(map, /defaultCenter=\{MELAKA_CENTER\}/);
  assert.match(map, /defaultZoom=\{13\}/);
  assert.doesNotMatch(map, /fitBounds/);
  assert.match(map, /MelakaHighlight/);
  assert.match(map, /MarkerClusterer/);
  assert.match(map, /Drag a pin to adjust its location/);
});

test("dragging a map pin explicitly patches both coordinate fields without saving", () => {
  const page = read("../pages/admin/AdminVendorManagementPage.jsx");
  const dragHandler = page.match(/const handleMapDragEnd = \(vendor, position\) => \{[\s\S]*?\n  \};/u)?.[0] || "";

  assert.match(dragHandler, /setForm\(\(current\)/);
  assert.match(dragHandler, /latitude: String\(position\.lat\)/);
  assert.match(dragHandler, /longitude: String\(position\.lng\)/);
  assert.doesNotMatch(dragHandler, /updateAdminVendor|fetchAllPages|getAdminVendors/);
  assert.match(page, /openVendorForEdit = \(vendor, baselineVendor = vendor\)/);
  assert.match(dragHandler, /openVendorForEdit\(\{ \.\.\.vendor, \.\.\.coordinates \}, vendor\)/);
});
