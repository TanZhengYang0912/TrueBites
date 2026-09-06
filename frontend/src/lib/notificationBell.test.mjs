import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/discovery/NotificationBell.jsx", import.meta.url),
  "utf8",
);

test("the bell renders exact first-publication and reactivation copy", () => {
  assert.match(source, /case "vendor_reactivated":/);
  assert.match(source, /\$\{item\.name\} is available again!/);
  assert.match(source, /New restaurant: \$\{item\.name\}!/);
});

test("opening an event navigates by vendor id and marks the event id read", () => {
  assert.match(source, /onOpenVendor\?\.\(item\.vendor_id\)/);
  assert.match(source, /markNotificationRead\(item\.id\)/);
  assert.match(source, /onClick=\{\(\) => openNotification\(item\)\}/);
  assert.doesNotMatch(source, /onOpenVendor\?\.\(id\)/);
});
