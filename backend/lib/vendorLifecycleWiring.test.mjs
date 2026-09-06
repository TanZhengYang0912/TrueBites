import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readRoute = (name) => readFileSync(new URL(`../routes/${name}`, import.meta.url), "utf8");

for (const route of ["admin.js", "vendors.js", "adminSuggestions.js"]) {
  test(`${route} classifies successful activation events`, () => {
    const source = readRoute(route);
    assert.match(source, /notificationTypeForActivation/);
    assert.match(source, /published_at/);
    assert.match(source, /notifyVendorLifecycle/);
  });
}

test("first publication is stamped without overwriting an existing date", () => {
  for (const route of ["admin.js", "vendors.js", "adminSuggestions.js"]) {
    const source = readRoute(route);
    assert.match(source, /activationType === NEW_VENDOR_NOTIFICATION/);
  }
});
