import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bell = read("../components/discovery/NotificationBell.jsx");

test("a notification opens its vendor, not its own id", () => {
  assert.match(bell, /onOpenVendor\?\.\(item\.vendor_id\)/, "the bell still passes the notification id as a vendor id");
  assert.match(bell, /markNotificationRead\(item\.id\)/, "read-marking must still use the notification's own id");
  assert.doesNotMatch(bell, /onOpenVendor\?\.\(id\)/, "the old wrong argument is still there");
});
