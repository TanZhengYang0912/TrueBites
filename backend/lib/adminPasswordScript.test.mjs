import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const scriptUrl = new URL("../scripts/setAdminPassword.js", import.meta.url);

test("admin password script uses hidden stdin input and the Supabase Admin API", () => {
  assert.equal(fs.existsSync(scriptUrl), true, "setAdminPassword.js should exist");

  const source = fs.readFileSync(scriptUrl, "utf8");
  assert.match(source, /function askHidden\(/);
  assert.match(source, /const PASSWORD_RE = \/\^\(\?=\.\*\[A-Za-z\]\)\(\?=\.\*\\d\)\.\{8,\}\$\//);
  assert.match(source, /supabase\.auth\.admin\.updateUserById\(/);
  assert.match(source, /action: "admin\.password_set_by_script"/);
  assert.doesNotMatch(source, /--password/);
});
