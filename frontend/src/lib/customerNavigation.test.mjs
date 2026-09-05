import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (relativePath) => fs.readFileSync(path.join(here, "..", relativePath), "utf8");

test("saved and reviews are owned by separate page components", () => {
  const app = src("App.jsx");

  assert.match(app, /import SavedPage\s+from "\.\/pages\/SavedPage"/);
  assert.match(app, /import ReviewsPage\s+from "\.\/pages\/ReviewsPage"/);
  assert.match(app, /path="\/saved" element={<SavedPage \/>}/);
  assert.match(app, /path="\/reviews" element={<ReviewsPage \/>}/);
  assert.doesNotMatch(app, /EngagementPage|section="(?:saved|reviews)"/);
  assert.equal(fs.existsSync(path.join(here, "..", "pages", "EngagementPage.jsx")), false);
});

test("customer page navigation uses guarded router links without tab decoration", () => {
  const header = src("components/discovery/DiscoveryHeader.jsx");

  assert.match(header, /<Link\s+to="\/saved"/s);
  assert.match(header, /<Link\s+to="\/reviews"/s);
  assert.match(header, /<Link\s+to="\/suggestions"/s);
  assert.match(header, /onClick=\{goGated\("\/saved"\)\}/);
  assert.match(header, /onClick=\{goGated\("\/reviews"\)\}/);
  assert.match(header, /onClick=\{goGated\("\/suggestions"\)\}/);
  assert.match(header, /aria-current=.*"page"/s);
  assert.doesNotMatch(header, /const NAV_ACTIVE = `\$\{NAV_LINK\}[^`]*(?:bg-|after:|border-b)/);
});
