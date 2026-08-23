import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../pages/admin/AdminUserModerationPage.jsx", import.meta.url);

test("user moderation falls back to initials when an avatar cannot load", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /function UserAvatar\(/);
  assert.match(source, /user\.avatarUrl && !imageFailed/);
  assert.match(source, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(source, /avatar-fallback/);
});
