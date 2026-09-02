import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const vendorCard = read("../components/discovery/VendorCard.jsx");
const vendorDetailModal = read("../components/discovery/VendorDetailModal.jsx");

test("VendorCard renders Bookmark for its save control", () => {
  assert.match(vendorCard, /import \{[^}]*\bBookmark\b[^}]*\} from ["']lucide-react["']/s);

  const saveControl = vendorCard.match(
    /<button[\s\S]*?onClick=\{\(event\) => \{ event\.stopPropagation\(\); onToggleBookmark\(vendor\.id\); \}\}[\s\S]*?<\/button>/,
  )?.[0] || "";
  assert.match(saveControl, /<Bookmark\b/);
});

test("VendorDetailModal uses Bookmark for every save control and never Heart", () => {
  assert.doesNotMatch(vendorDetailModal, /import \{[^}]*\bHeart\b[^}]*\} from ["']lucide-react["']/s);
  assert.doesNotMatch(vendorDetailModal, /<Heart\b/);
  assert.match(vendorDetailModal, /import \{[^}]*\bBookmark\b[^}]*\} from ["']lucide-react["']/s);

  const saveControls = [...vendorDetailModal.matchAll(
    /<IconBtn[\s\S]*?onClick=\{\(\) => onToggleBookmark\(vendor\.id\)\}[\s\S]*?<\/IconBtn>/g,
  )].map(([markup]) => markup);
  assert.equal(saveControls.length, 2);
  for (const saveControl of saveControls) {
    assert.match(saveControl, /<Bookmark\b/);
    assert.match(saveControl, /fill=\{bookmarked \? TERRACOTTA : "none"\}/);
  }
});
