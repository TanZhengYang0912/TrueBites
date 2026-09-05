import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const loginPage = read("../pages/LoginPage.jsx");
const header = read("../components/discovery/DiscoveryHeader.jsx");
const guestPrompt = read("../components/discovery/GuestPrompt.jsx");

test("the auth vocabulary is Log In and Sign Up everywhere", () => {
  for (const [name, source] of [["LoginPage", loginPage], ["DiscoveryHeader", header], ["GuestPrompt", guestPrompt]]) {
    assert.doesNotMatch(source, /Sign In|Sign in for|Create Account|Sign up</, `${name} still uses retired auth copy`);
  }
  assert.match(loginPage, />\s*Log In\s*</, "LoginPage is missing the Log In tab");
  assert.match(loginPage, />\s*Sign Up\s*</, "LoginPage is missing the Sign Up tab");
  assert.match(header, />\s*Sign Up\s*</, "the header is missing Sign Up");
});

const callSites = [
  "../pages/MapPage.jsx",
  "../pages/ReviewsPage.jsx",
  "../pages/SuggestionsPage.jsx",
  "../pages/SuggestionFormPage.jsx",
  "../pages/SavedPage.jsx",
  "../components/StaticPageLayout.jsx",
  "../components/Dashboard.jsx",
];

test("signing up opens the signup tab, not the login tab", () => {
  assert.match(loginPage, /useSearchParams/, "LoginPage does not read the mode param");
  assert.match(loginPage, /mode"\)\s*===\s*"signup"/, "LoginPage does not derive the initial tab from ?mode=signup");
  for (const path of callSites) {
    const source = read(path);
    // `onSignUp={() => …}` in JSX, `onSignUp: () => …` in an object literal.
    assert.match(source, /onSignUp[:=]\s*\{?\s*\(\)\s*=>\s*navigate\("\/login\?mode=signup"\)/,
      `${path} still sends Sign Up to the login tab`);
  }
});

test("the guest header offers one account menu, not two buttons", () => {
  assert.match(header, /aria-haspopup="menu"/, "the account trigger is not a menu trigger");
  assert.match(header, /aria-expanded=\{menuOpen\}/, "the account trigger does not report its state");
  assert.match(header, /role="menu"/, "there is no menu panel");
  assert.match(header, /role="menuitem"/, "the menu has no items");
  assert.match(header, /onClick=\{onLogin\}/, "the menu does not offer Log In");
  assert.match(header, /onClick=\{onSignUp\}/, "the menu does not offer Sign Up");
  assert.doesNotMatch(header, /border border-forest px-3 text-\[13px\] font-semibold text-forest/,
    "the standalone Sign Up button is still in the header");
});

test("the account menu can be dismissed", () => {
  assert.match(header, /pointerdown/, "the menu does not close on an outside click");
  assert.match(header, /event\.key === "Escape"/, "the menu does not close on Escape");
});

test("the login page has one back control, and it prefers history", () => {
  assert.doesNotMatch(loginPage, /Return to main page/, "the bottom text link is still there");
  assert.match(loginPage, /ArrowLeft/, "there is no back arrow");
  assert.match(loginPage, /location\.key !== "default"/, "the back arrow does not check for history");
  assert.match(loginPage, /navigate\(-1\)/, "the back arrow never goes back");
  assert.match(loginPage, /navigate\("\/discover"\)/, "the back arrow has no fallback");
  assert.doesNotMatch(loginPage, /<Link to="\/"/, "the logo is still a link");
});

test("the admin login page keeps its own exit", () => {
  const adminLogin = read("../pages/AdminLoginPage.jsx");
  assert.match(adminLogin, /Go to main page instead/, "AdminLoginPage was changed; it is out of scope");
  assert.match(loginPage, /export const AUTH_LINK/, "AUTH_LINK is no longer exported for AdminLoginPage");
});
