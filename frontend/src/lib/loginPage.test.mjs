import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginPath = new URL("../pages/LoginPage.jsx", import.meta.url);

test("a signed-in account leaves the customer login form", async () => {
  const source = await readFile(loginPath, "utf8");

  assert.match(source, /if \(!sessionLoading && session && !justSignedUp\)/);
  assert.doesNotMatch(source, /!justSignedUp && !isAdmin\(session\)/);
  assert.match(source, /navigate\("\/discover", \{ replace: true \}\)/);
});
