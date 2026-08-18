import test from "node:test";
import assert from "node:assert/strict";

import { fetchDrivingRoute } from "./drivingRoute.js";

test("falls back to OSRM when Google Directions is unavailable", async () => {
  const requestedUrls = [];
  const fakeFetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).includes("maps.googleapis.com")) {
      return { json: async () => ({ status: "REQUEST_DENIED", routes: [] }) };
    }
    return {
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1250,
          duration: 180,
          geometry: { coordinates: [[102.25, 2.19], [102.26, 2.2]] },
        }],
      }),
    };
  };

  const result = await fetchDrivingRoute(
    { fromLat: 2.19, fromLng: 102.25, toLat: 2.2, toLng: 102.26 },
    { googleApiKey: "test-key", fetchImpl: fakeFetch },
  );

  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /maps\.googleapis\.com/);
  assert.match(requestedUrls[1], /router\.project-osrm\.org/);
  assert.deepEqual(result, {
    distance: "1.3 km",
    duration: "3 mins",
    path: [{ lat: 2.19, lng: 102.25 }, { lat: 2.2, lng: 102.26 }],
  });
});
