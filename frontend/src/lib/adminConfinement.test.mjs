import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

test("a signed-in admin is redirected off every non-admin path", () => {
  const app = read("../App.jsx");

  assert.match(app, /!location\.pathname\.startsWith\("\/admin"\)/);
  assert.match(app, /location\.pathname !== "\/reset-password"/);
});

test("the admin viewing bar is gone", () => {
  assert.equal(exists("../components/AdminViewingBar.jsx"), false,
    "AdminViewingBar.jsx should be deleted");
  const app = read("../App.jsx");
  assert.doesNotMatch(app, /AdminViewingBar/,
    "App.jsx should no longer import or render AdminViewingBar");
});

test("the customer login page rejects admin accounts", () => {
  const login = read("../pages/LoginPage.jsx");

  assert.match(login, /isAdmin\(\{ user: data\.user \}\)/,
    "LoginPage should check the freshly returned user's role");
  assert.match(login, /supabase\.auth\.signOut\(\)/,
    "LoginPage should sign an admin back out");
  assert.doesNotMatch(login, /!justSignedUp && !isAdmin\(session\)/);
});

test("no in-app surface can change an admin password", () => {
  assert.equal(exists("../pages/SetAdminPasswordPage.jsx"), false,
    "SetAdminPasswordPage.jsx should be deleted");

  const app = read("../App.jsx");
  assert.doesNotMatch(app, /SetAdminPasswordPage/);
  assert.doesNotMatch(app, /admin-set-password/);

  const adminLogin = read("../pages/AdminLoginPage.jsx");
  assert.doesNotMatch(adminLogin, /must_change_password/,
    "AdminLoginPage should no longer route to a password-change page");

  const account = read("../pages/admin/AdminAccountPage.jsx");
  assert.doesNotMatch(account, /updateUser/,
    "AdminAccountPage should no longer call updateUser");
  assert.doesNotMatch(account, /Change password/,
    "AdminAccountPage should no longer render a change-password form");

  const reset = read("../pages/ResetPasswordPage.jsx");
  assert.match(reset, /isAdmin/);
  assert.match(reset, /signOut\(\)/);
});
