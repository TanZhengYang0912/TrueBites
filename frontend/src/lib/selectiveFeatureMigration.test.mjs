import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.join(here, "..", relativePath), "utf8");

const login = read("pages/LoginPage.jsx");
const profile = read("pages/ProfilePage.jsx");
const reset = read("pages/ResetPasswordPage.jsx");
const adminLogin = read("pages/AdminLoginPage.jsx");
const vendorAdmin = read("pages/admin/AdminVendorManagementPage.jsx");

for (const source of [login, reset, adminLogin]) {
  assert.match(source, /PasswordField/, "password pages should share PasswordField");
}

assert.match(login, /wrong email or password/i, "invalid credentials should have a friendly message");
assert.match(profile, /resetPasswordForEmail/, "profile reset should send a reset email");
assert.match(reset, /redirect.*profile|fromProfile/, "profile reset should return to the profile page");
assert.match(vendorAdmin, /useMapsLibrary|AddressAutocomplete/, "admin address should support Places autocomplete");

console.log("selective feature migration checks: passed");
