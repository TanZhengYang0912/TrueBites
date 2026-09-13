import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const faviconUrl = new URL("../../public/favicon.png", import.meta.url);
const indexHtml = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("favicon.png is a real PNG image", () => {
  assert.equal(fs.existsSync(faviconUrl), true, "public/favicon.png should exist");

  const favicon = fs.readFileSync(faviconUrl);
  assert.ok(favicon.subarray(0, 8).equals(PNG_SIGNATURE), "favicon.png should start with the PNG signature");
});

test("document head points its icon and apple-touch-icon at the PNG favicon", () => {
  assert.match(indexHtml, /<link rel="icon" type="image\/png" href="\/favicon\.png" \/>/);
  assert.match(indexHtml, /rel="apple-touch-icon" href="\/favicon\.png"/);
  assert.doesNotMatch(indexHtml, /favicon\.svg/);
});
