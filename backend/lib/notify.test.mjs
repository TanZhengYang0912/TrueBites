import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const notify = readFileSync(new URL("./notify.js", import.meta.url), "utf8");

test("a vendor is only ever announced once", () => {
  assert.match(notify, /select\(/, "notifyNewVendor never checks for an existing announcement");
  assert.match(notify, /\.eq\("type", "new_vendor"\)/, "the existence check is not scoped to the new_vendor type");
  assert.match(notify, /\.limit\(1\)/, "the lookup must cap at one row — see the maybeSingle trap in the plan");
  assert.match(notify, /if \(existing\)/, "nothing short-circuits when an announcement already exists");
});

test("notifyNewVendor still cannot throw", () => {
  assert.match(notify, /try \{[\s\S]*catch/, "the try/catch that protects the publish request is gone");
});
