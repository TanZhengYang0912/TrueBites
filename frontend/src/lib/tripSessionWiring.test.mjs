import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sessionContext = readFileSync(new URL("./SessionContext.jsx", import.meta.url), "utf8");
const mapPage = readFileSync(new URL("../pages/MapPage.jsx", import.meta.url), "utf8");
const tripFab = readFileSync(new URL("../components/TripFab.jsx", import.meta.url), "utf8");

test("SessionProvider clears trip persistence only across real identity boundaries", () => {
  assert.match(sessionContext, /createTripSessionBoundary/);
  assert.match(sessionContext, /clearTrip/);
  assert.match(sessionContext, /observeTripSession\(s\)/);
});

test("MapPage hydrates and saves trips under the resolved session owner", () => {
  assert.match(mapPage, /loading:\s*sessionLoading/);
  assert.match(mapPage, /tripOwner\(authSession\)/);
  assert.match(mapPage, /loadTrip\(owner\)/);
  assert.match(mapPage, /saveTrip\(trip,\s*travelMode,\s*owner\)/);
  assert.match(mapPage, /hydratedOwner\s*!==\s*owner/);
});

test("global trip count never reads another account's stored trip", () => {
  assert.match(tripFab, /useSession\(\)/);
  assert.match(tripFab, /tripOwner\(session\)/);
  assert.match(tripFab, /subscribeTripCount\(setCount,\s*owner\)/);
});
