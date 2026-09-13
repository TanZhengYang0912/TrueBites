import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginPath = new URL("../pages/LoginPage.jsx", import.meta.url);

test("a signed-in customer leaves the customer login form", async () => {
  const source = await readFile(loginPath, "utf8");

  // customerSession(), not raw session: an admin mid "View Site" preview can
  // land here (clicking a guest-only "Sign in" prompt) with a real, truthy
  // admin session — raw `session` treated that as "already signed in" and
  // bounced straight back to /discover before the form ever rendered,
  // making "click Log In during a preview" look like it silently did
  // nothing. customerSession() reports an admin session as null, same as
  // every other guest-facing page, so the form renders for them instead.
  assert.match(source, /import \{ isAdmin, customerSession \} from "\.\.\/lib\/roles"/);
  assert.match(source, /const alreadySignedIn = customerSession\(session\)/);
  assert.match(source, /if \(!sessionLoading && alreadySignedIn && !justSignedUp\)/);
  assert.doesNotMatch(source, /!justSignedUp && !isAdmin\(session\)/);
  assert.match(source, /navigate\("\/discover", \{ replace: true \}\)/);
});
