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

test("every genuine activation stamps the latest publication time", () => {
  const expectations = [
    ["admin.js", /if \(activationType\) patch\.published_at = updatedAt/],
    ["vendors.js", /if \(activationType\) patch\.published_at = activatedAt/],
    ["adminSuggestions.js", /if \(activationType\) vendorPatch\.published_at = reviewedAt/],
  ];

  for (const [route, expected] of expectations) {
    const source = readRoute(route);
    assert.match(source, expected);
    assert.doesNotMatch(source, /activationType === NEW_VENDOR_NOTIFICATION[^\n]*published_at/);
  }
});
