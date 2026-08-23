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
  assert.match(source, /openSuggestionsPdf/);
  assert.match(source, /Export PDF/);
  assert.match(source, /onClick=\{\(\) => load\(data\.pagination\.page\)\}/);
});

test("my audit log has no duplicate page header", () => {
  const source = read("pages/admin/AdminMyAuditLogPage.jsx");
  assert.doesNotMatch(source, /admin-panel-header/);
  assert.doesNotMatch(source, /setTopbarAction/);
});

test("user moderation supports selecting users for a batch suspend action", () => {
  const source = read("pages/admin/AdminUserModerationPage.jsx");
  assert.match(source, /selectedIds/);
  assert.match(source, /handleSelectAll/);
  assert.match(source, /handleSelectOne/);
  assert.match(source, /handleBatchSuspend/);
  assert.match(source, /XCircle/);
  assert.match(source, /Suspend selected/);
  assert.doesNotMatch(source, /openUsersPdf/);
  assert.doesNotMatch(source, /Export PDF/);
});

test("settings page uses deployment-safe processing copy", () => {
  const source = read("pages/admin/AdminSettingsPage.jsx");

  assert.match(source, /From the latest processing jobs/);
  assert.match(source, /No processing activity yet/);
  assert.match(source, /No recent AI job files found yet/);
  assert.doesNotMatch(source, /latest local jobs|local processing activity|local AI job files/);
});
