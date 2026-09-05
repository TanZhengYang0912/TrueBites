import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("/discover and /map both render MapPage", () => {
  const app = read("../App.jsx");
  assert.match(app, /<Route path="\/discover"[^>]*element=\{<MapPage \/>\}/);
  assert.match(app, /<Route path="\/map"[^>]*element=\{<MapPage \/>\}/);
});

test("/discover is reachable without a session", () => {
  const app = read("../App.jsx");
  const paths = app.slice(app.indexOf("AUTH_PUBLIC_PATHS"), app.indexOf("];", app.indexOf("AUTH_PUBLIC_PATHS")));
  assert.match(paths, /"\/discover"/);
});

// Files that link to the discovery list. None of them may reach it via
// "/map" — that path means the pin map.
const DISCOVERY_LINKERS = [
  "../App.jsx",
  "../components/Dashboard.jsx",
  "../components/StaticPageLayout.jsx",
  "../pages/SuggestionsPage.jsx",
  "../pages/ReviewsPage.jsx",
  "../pages/SavedPage.jsx",
  "../pages/SuggestionFormPage.jsx",
  "../pages/OnboardingPage.jsx",
  "../pages/LoginPage.jsx",
  "../pages/ProfilePage.jsx",
  "../pages/AdminLoginPage.jsx",
  "../pages/AccountSuspendedPage.jsx",
];

// These also link to the pin map, so a bare navigate("/map") is legitimate
// there and only the discovery handler is checked.
const ALSO_LINK_TO_MAP = new Set([
  "../components/StaticPageLayout.jsx",
  "../pages/SuggestionsPage.jsx",
  "../pages/ReviewsPage.jsx",
  "../pages/SavedPage.jsx",
  "../pages/SuggestionFormPage.jsx",
]);

test("nothing navigates to /map expecting the discovery list", () => {
  for (const path of DISCOVERY_LINKERS) {
    const source = read(path);
    assert.doesNotMatch(source, /navigate\("\/map", \{ replace: true \}\)/, `${path} still redirects to /map`);
    assert.doesNotMatch(source, /to="\/map"/, `${path} still links to /map`);
    assert.doesNotMatch(source, /onOpenDiscover[^\n]*"\/map"/, `${path} still opens Discover at /map`);
    if (!ALSO_LINK_TO_MAP.has(path)) {
      assert.doesNotMatch(source, /navigate\("\/map"\)/, `${path} still navigates to /map`);
    }
  }
});

test("vendor deep links open the list, not the map", () => {
  for (const path of ["../components/StaticPageLayout.jsx", "../pages/ReviewsPage.jsx",
                      "../pages/SavedPage.jsx", "../components/suggestions/SuggestionStatusCard.jsx"]) {
    assert.doesNotMatch(read(path), /\/map\?vendor=/, `${path} deep-links a vendor onto the map`);
  }
});

test("the view comes from the path, not a search param", () => {
  const mapPage = read("../pages/MapPage.jsx");
  assert.match(mapPage, /location\.pathname === "\/map"/);
  assert.doesNotMatch(mapPage, /searchParams\.get\("view"\)/);
  // ?vendor= is a separate deep-link param and must survive.
  assert.match(mapPage, /searchParams\.get\("vendor"\)/);
});

test("nothing uses the retired ?view=map param", () => {
  const files = [
    "../pages/MapPage.jsx",
    "../components/TripFab.jsx",
    "../components/StaticPageLayout.jsx",
    "../pages/SuggestionsPage.jsx",
    "../pages/ReviewsPage.jsx",
    "../pages/SavedPage.jsx",
    "../pages/SuggestionFormPage.jsx",
  ];
  for (const path of files) {
    assert.doesNotMatch(read(path), /view=map/, `${path} still uses ?view=map`);
  }
});

test("the header has Discover and Map as links, not a toggle", () => {
  const header = read("../components/discovery/DiscoveryHeader.jsx");

  assert.doesNotMatch(header, /View mode/, "the List/Map toggle should be gone");
  assert.doesNotMatch(header, /mapActive/, "the mapActive prop should be gone");
  assert.doesNotMatch(header, /onOpenMap/, "the onOpenMap prop should be gone");

  // Must be React Router <Link>, not <a href> — an anchor reloads the page,
  // unmounting MapPage and wiping the state the two views share.
  assert.match(header, /<Link\s+to="\/discover"/);
  assert.match(header, /<Link\s+to="\/map"/);
  assert.doesNotMatch(header, /href="\/discover"|href="\/map"/,
    "Discover and Map must not be plain anchors");
});

test("the map still asks for the user's location on arrival", () => {
  const mapPage = read("../pages/MapPage.jsx");
  assert.match(mapPage, /getCurrentPosition/,
    "geolocation must survive the toggle removal, or the map stops centring on the user");
});

test("suspended customers are not blocked from the map", () => {
  const mapPage = read("../pages/MapPage.jsx");
  assert.doesNotMatch(mapPage, /the map isn't available right now/,
    "the map-specific suspension block should be gone");
});

test("suspension is still enforced everywhere else", () => {
  // The banner that tells a suspended customer why, and links to the appeal.
  const dashboard = read("../components/Dashboard.jsx");
  assert.match(dashboard, /accountStatus\?\.suspended/);
  assert.match(dashboard, /account-suspended/);
});
