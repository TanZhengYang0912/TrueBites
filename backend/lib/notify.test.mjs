import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./notify.js", import.meta.url), "utf8");

test("the writer accepts both vendor lifecycle event types", () => {
  assert.match(source, /notifyVendorLifecycle/);
  assert.match(source, /NEW_VENDOR_NOTIFICATION/);
  assert.match(source, /VENDOR_REACTIVATED_NOTIFICATION/);
  assert.match(source, /type,\s*vendor_id:/);
});

test("notification failures are handled without escaping to the status request", () => {
  assert.match(source, /const \{ error \} = await supabase/);
  assert.match(source, /if \(error\) throw error/);
  assert.match(source, /try \{[\s\S]*catch/);
});

test("reactivations are not globally deduplicated by vendor id", () => {
  assert.doesNotMatch(source, /\.eq\("vendor_id",\s*id\)/);
  assert.doesNotMatch(source, /if \(existing\) return/);
});
