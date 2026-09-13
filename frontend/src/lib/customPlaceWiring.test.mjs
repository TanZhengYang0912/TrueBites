import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const locationInput = read("../components/LocationInput.jsx");
const loader = read("../components/CustomPlaceDetailsLoader.jsx");

test("the latest PR 53 location input is enriched without replacing its UI", () => {
  assert.match(locationInput, /defaultValue/);
  assert.match(locationInput, /autoFocus/);
  assert.match(locationInput, /onBlur=\{revertIfUnselected\}/);
  assert.match(locationInput, /event\.key === "Escape"/);
  assert.match(locationInput, /onGps && \(/);
  assert.match(locationInput, /biasCenter/);
  assert.match(locationInput, /strictBounds:\s*false/);
  assert.match(locationInput, /"place_id"/);
  assert.match(locationInput, /"formatted_address"/);
  assert.match(locationInput, /fetchGooglePlaceDetails/);
  assert.match(locationInput, /createLatestSelectionGate/);
  assert.doesNotMatch(locationInput, /GOOGLE_API_KEY|regularOpeningHours|photos/);
});

test("custom place display details refresh by Place ID without rendering UI", () => {
  assert.match(loader, /useMapsLibrary\("places"\)/);
  assert.match(loader, /stop\.type === "custom" && stop\.placeId/);
  assert.match(loader, /fetchGooglePlaceDetails/);
  assert.match(loader, /onDetails\?\.\(stop\.id, stop\.placeId, details\)/);
  assert.match(loader, /return null/);
  assert.doesNotMatch(loader, /source === "custom"|GOOGLE_API_KEY/);
});

test("MapPage converts custom drafts and refreshes them without changing marker ownership", () => {
  const mapPage = read("../pages/MapPage.jsx");
  assert.match(mapPage, /customStopFromPlace/);
  assert.match(mapPage, /<CustomPlaceDetailsLoader/);
  assert.match(mapPage, /stop\.type === "custom" && stop\.placeId === placeId/);
  assert.match(mapPage, /locationBias/);
  assert.doesNotMatch(mapPage, /customStops=\{customStops\}/);
});
