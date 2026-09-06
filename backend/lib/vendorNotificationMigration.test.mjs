import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationUrl = new URL("../../supabase/migrations/202609060001_vendor_reactivation_notifications.sql", import.meta.url);

test("the migration permits reactivation events and backfills only the four approved rows", () => {
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /'new_vendor',\s*'vendor_reactivated'/);
  assert.match(sql, /published_at\s*=\s*created_at/i);
  assert.match(sql, /1381d638-a420-4c16-80b6-167337ae5bbf/);
  assert.match(sql, /0f7cff30-4eda-4a2c-adce-462834e59707/);
  assert.match(sql, /c4bbaeae-f313-48b2-87f0-6dcdd3894b2f/);
  assert.match(sql, /2b570cdc-9a9f-4848-a5c6-90bc4c18d784/);
  assert.match(sql, /status\s*=\s*'suspended'/i);
  assert.match(sql, /published_at\s+is\s+null/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.notifications/i);
});
