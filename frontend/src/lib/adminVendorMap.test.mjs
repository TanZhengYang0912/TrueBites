import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

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
