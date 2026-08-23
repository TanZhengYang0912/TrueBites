import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("admin suggestions uses the shared layout title and keeps refresh in the filter row", () => {
  const source = read("pages/admin/AdminSuggestionsPage.jsx");
  assert.doesNotMatch(source, /Customer contribution queue/);
  assert.doesNotMatch(source, /<h2[^>]*>Community suggestions/);
  assert.match(source, /RefreshCw/);
  assert.match(source, /onClick=\{\(\) => load\(data\.pagination\.page\)\}/);
});

test("my audit log uses the layout topbar for export and has no duplicate page header", () => {
  const source = read("pages/admin/AdminMyAuditLogPage.jsx");
  assert.doesNotMatch(source, /admin-panel-header/);
  assert.match(source, /useOutletContext/);
  assert.match(source, /setTopbarAction/);
  assert.match(source, /Export PDF/);
});
