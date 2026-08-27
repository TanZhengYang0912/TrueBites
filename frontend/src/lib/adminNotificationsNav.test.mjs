import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../components/admin/AdminLayout.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

test("admin notifications open from the bell popover instead of a duplicate sidebar page", () => {
  assert.doesNotMatch(source, /to: "\/admin\/notifications", label: "Notifications", icon: Bell/);
  assert.match(source, /getAdminDashboard/);
  assert.match(source, /admin-notification-popover/);
  assert.match(source, /aria-expanded=\{notificationOpen\}/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /Notifications/);
  assert.doesNotMatch(appSource, /import AdminNotificationsPage/);
  assert.match(appSource, /path="notifications" element=\{<Navigate to="\/admin" replace \/>\}/);
});
