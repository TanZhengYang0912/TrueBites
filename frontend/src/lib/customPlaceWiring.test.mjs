import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const locationInput = await read("../components/LocationInput.jsx");
const detailsLoader = await read("../components/CustomPlaceDetailsLoader.jsx");
const tripPanel = await read("../components/TripPanel.jsx");
const mapPage = await read("../pages/MapPage.jsx");

test("Google custom-place selection is nearby-biased and enriched through one details boundary", () => {
  assert.match(locationInput, /fields:\s*\[[^\]]*"place_id"[^\]]*"formatted_address"/s);
  assert.match(locationInput, /biasCenter/);
  assert.match(locationInput, /strictBounds:\s*false/);
  assert.match(locationInput, /fetchGooglePlaceDetails\(placesLib, place\.place_id\)/);
  assert.match(locationInput, /createLatestSelectionGate/);
  assert.match(locationInput, /selectionGate\.isCurrent\(selectionId\)/);
  assert.match(detailsLoader, /fetchGooglePlaceDetails\(placesLib, placeId\)/);
  assert.doesNotMatch(locationInput, /photos|regularOpeningHours|GOOGLE_API_KEY/);
  assert.doesNotMatch(detailsLoader, /photos|regularOpeningHours|GOOGLE_API_KEY/);
});

test("every trip location input shares the current route origin as its Google search bias", () => {
  assert.match(tripPanel, /locationBias/);
  assert.equal((tripPanel.match(/biasCenter=\{locationBias\}/g) || []).length, 3);
  assert.match(mapPage, /locationBias=\{anchor \|\| MELAKA_CENTER\}/);
});

test("stored custom Place IDs refresh display-only details without a Supabase route", () => {
  assert.match(mapPage, /<CustomPlaceDetailsLoader/);
  assert.match(mapPage, /stops=\{trip\}/);
  assert.match(mapPage, /onDetails=\{refreshCustomStopDetails\}/);
  assert.match(mapPage, /refreshCustomStopDetails\s*=\s*useCallback/);
  assert.match(detailsLoader, /new Map\([\s\S]*stop\.placeId/);
  assert.match(detailsLoader, /onDetails\?\.\(stop\.id, stop\.placeId, details\)/);
  assert.match(mapPage, /stop\.placeId !== expectedPlaceId/);
  assert.doesNotMatch(detailsLoader, /\/api|supabase/i);
  assert.match(tripPanel, /id="google-place-attributions"/);
  assert.match(tripPanel, /s\.attributions/);
  assert.match(tripPanel, /google-place-attributions" className="[^"]*text-xs/);
  assert.match(mapPage, /onError=\{\(\) => setMapError\("Google Maps failed to load\. Please check the browser key, Maps JavaScript API, and billing settings\."\)\}/);
});

test("MapPage gives numbered custom stops their own markers and focus target", () => {
  assert.match(mapPage, /customStopsForMap\(trip\)/);
  assert.match(mapPage, /customStops=\{customStops\}/);
  assert.match(mapPage, /function FocusOnTripStop/);
  assert.match(mapPage, /<FocusOnTripStop stop=\{focusTripStop\} \/>/);
  assert.match(tripPanel, /onFocusStop\?\.\(s\)/);
});

test("custom-place cards use a generic pin and only their Google price label", () => {
  assert.match(tripPanel, /s\.source === "custom"[\s\S]*bg-\[#EEF3F0\][\s\S]*<MapPin size=\{16\} \/>/);
  assert.match(tripPanel, /const stopPrice = s\.vendor[\s\S]*priceLabel\(s\.vendor\)[\s\S]*s\.source === "custom"[\s\S]*s\.priceLabel[\s\S]*: null/);
  assert.match(tripPanel, /const metadata = \[routeDistance, stopPrice\]\.filter\(Boolean\)\.join\(" · "\)/);
  const thumbnailBranch = tripPanel.slice(
    tripPanel.indexOf("{s.vendor ? ("),
    tripPanel.indexOf("<button", tripPanel.indexOf("{s.vendor ? (")),
  );
  assert.match(thumbnailBranch, /src=\{vendorGallery\(s\.vendor\)\[0\]\}/);
  assert.equal((thumbnailBranch.match(/vendorGallery\(/g) || []).length, 1);
});
