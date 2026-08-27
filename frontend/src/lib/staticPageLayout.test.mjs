import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("static info pages use the Discover-sized site frame", () => {
  const source = read("components/StaticPageLayout.jsx");

  assert.match(source, /import DiscoveryHeader from "\.\/discovery\/DiscoveryHeader"/);
  assert.match(source, /<DiscoveryHeader/);
  assert.match(source, /<main className="[^"]*max-w-\[1360px\][^"]*pt-8[^"]*md:pt-12/);
  assert.doesNotMatch(source, /max-w-\[820px\]/);
  assert.doesNotMatch(source, /<header /);
  assert.doesNotMatch(source, /TrueBitesLogo/);
  assert.match(source, /<Footer \/>/);
});

test("static info pages do not mark Discover as the active section", () => {
  const source = read("components/StaticPageLayout.jsx");

  assert.match(source, /activeSection=\{null\}/);
});
