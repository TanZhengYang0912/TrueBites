import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginPath = new URL("../pages/LoginPage.jsx", import.meta.url);

test("admin can open the login form to switch to a customer account", async () => {
  const source = await readFile(loginPath, "utf8");

  assert.match(source, /if \(!sessionLoading && session && !justSignedUp && !isAdmin\(session\)\)/);
  assert.match(source, /navigate\("\/map", \{ replace: true \}\)/);
});
