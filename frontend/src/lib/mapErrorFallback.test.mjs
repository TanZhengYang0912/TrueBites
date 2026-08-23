import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../pages/MapPage.jsx", import.meta.url);

test("map page handles Google Maps authorization failures without rendering a broken map", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /gm_authFailure/);
  assert.match(source, /mapError/);
  assert.match(source, /BillingNotEnabledMapError/);
  assert.match(source, /This page can't load Google Maps correctly/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /Map temporarily unavailable/);
  assert.match(source, /onError=\{\(error\) => setMapError/);
});
