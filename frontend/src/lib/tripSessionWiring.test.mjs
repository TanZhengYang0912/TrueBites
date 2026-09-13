import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sessionContext = readFileSync(new URL("./SessionContext.jsx", import.meta.url), "utf8");
const mapPage = readFileSync(new URL("../pages/MapPage.jsx", import.meta.url), "utf8");
const tripFab = readFileSync(new URL("../components/TripFab.jsx", import.meta.url), "utf8");

test("SessionProvider reconciles ownership before publishing auth state", () => {
  assert.match(sessionContext, /function syncIdentity\(nextSession\) \{\s*reconcileTripOwner\(nextSession\);\s*const nextOwner = tripOwner\(nextSession\);/);
  assert.match(sessionContext, /syncIdentity\(data\.session\);\s*setSession\(data\.session\)/);
  assert.match(sessionContext, /syncIdentity\(nextSession\);\s*setSession\(nextSession\)/);
  assert.match(sessionContext, /if \(nextOwner === lastOwner\) return;\s*lastOwner = nextOwner;\s*clearSavedCount\(\);\s*clearBookmarksCache\(\);\s*clearReviewsCache\(\);/);
  assert.doesNotMatch(sessionContext, /outcome === "cleared"/, "caches clear on any owner change, not only when a foreign trip was removed");
  assert.doesNotMatch(sessionContext, /createTripSessionBoundary|clearTrip|mapOriginSession/);
});

test("MapPage hydrates and saves trips under the resolved session owner", () => {
  assert.match(mapPage, /loading:\s*sessionLoading/);
  assert.match(mapPage, /tripOwner\(authSession\)/);
  assert.match(mapPage, /loadTrip\(owner\)/);
  assert.match(mapPage, /saveTrip\(trip,\s*travelMode,\s*owner\)/);
  assert.match(mapPage, /hydratedOwner\s*!==\s*owner/);
  assert.match(mapPage, /loadMapOrigin\(\)/);
  assert.match(mapPage, /saveMapOrigin/);
  assert.match(mapPage, /createMapOriginSessionBoundary/);
  assert.match(mapPage, /clearMapOrigin/);
});

test("global trip count never reads another account's stored trip", () => {
  assert.match(tripFab, /useSession\(\)/);
  assert.match(tripFab, /tripOwner\(session\)/);
  assert.match(tripFab, /subscribeTripCount\(setCount,\s*owner\)/);
});
