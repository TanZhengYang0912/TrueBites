import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const faviconUrl = new URL("../../public/favicon.svg", import.meta.url);
const indexHtml = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("favicon is transparent and adapts its mark to light and dark browser themes", () => {
  assert.equal(fs.existsSync(faviconUrl), true, "public/favicon.svg should exist");

  const favicon = fs.readFileSync(faviconUrl, "utf8");
  assert.match(favicon, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(favicon, /--mark:\s*#000/);
  assert.match(favicon, /--mark:\s*#fff/);
  assert.match(favicon, /stroke="currentColor"/);
  assert.match(favicon, /fill="currentColor"/);
  assert.doesNotMatch(favicon, /<rect\b/);
});

test("document head prefers the adaptive SVG and retains the PNG fallback", () => {
  const svgLink = indexHtml.indexOf('type="image/svg+xml" href="/favicon.svg"');
  const pngLink = indexHtml.indexOf('type="image/png" href="/favicon.png"');

  assert.notEqual(svgLink, -1);
  assert.notEqual(pngLink, -1);
  assert.ok(svgLink < pngLink);
  assert.match(indexHtml, /rel="apple-touch-icon" href="\/favicon\.png"/);
});
