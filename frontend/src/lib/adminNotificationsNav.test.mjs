import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../components/admin/AdminLayout.jsx", import.meta.url), "utf8");

test("admin notifications are available from the sidebar", () => {
  assert.match(source, /to: "\/admin\/notifications", label: "Notifications", icon: Bell/);
  assert.doesNotMatch(source, /only via the bell icon/);
});
