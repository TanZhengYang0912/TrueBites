import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const mapPage = read("../pages/MapPage.jsx");
const tripPanel = read("../components/TripPanel.jsx");
const stopMarkers = read("../components/TripStopMarkers.jsx");
const directions = read("../components/DirectionsRenderer.jsx");
const locationInput = read("../components/LocationInput.jsx");

test("restoration preserves PR 53 UI and marker ownership", () => {
  assert.match(tripPanel, />Search area</);
  assert.match(tripPanel, /Choose search area…/);
  assert.match(tripPanel, /<Plus size=\{13\} \/> Add stop/);
  assert.match(tripPanel, /rowsFor\(trip, draftStops\)/);
  assert.match(tripPanel, /draggable=\{!row\.draft\}/);
  assert.match(mapPage, /<TripStopMarkers trip=\{trip\} draftStops=\{draftStops\} userPos=\{userPos\} \/>/);
  assert.match(stopMarkers, /groupStopsByPosition\(numberedStops\)/);
  assert.match(stopMarkers, /<HawkerStallPin stopNum=\{group\.stops\.map/);
});

test("restoration is behavioural, not an old component rollback", () => {
  assert.doesNotMatch(tripPanel, /addingPlace|editingId|Pencil|Search a place to add/);
  assert.doesNotMatch(mapPage, /customStops=\{customStops\}/);
  assert.doesNotMatch(directions, /OSRM only optimises stop order/);
  assert.doesNotMatch(locationInput, /className="mb-2 min-h-11/);
});

test("active trip routing uses Google data for the selected mode", () => {
  assert.match(mapPage, /import \{ getRestaurants, getTrip \} from "\.\.\/api"/);
  assert.match(mapPage, /travelMode === "DRIVING"[\s\S]*getTrip/);
  assert.match(mapPage, /const routingStops = useMemo\([\s\S]*selectRoutingStops\(trip, travelMode\)/);
  assert.match(mapPage, /<DirectionsRenderer[\s\S]*stops=\{routingStops\}/);
  assert.match(directions, /optimizeWaypoints:\s*true/);
  assert.match(directions, /requestedMode === "TRANSIT" \|\| requestedMode === "DRIVING"/);
  assert.match(tripPanel, /"Suggest Best Order"/);
  assert.match(mapPage, /buildArrivalTimeline/);
  assert.match(mapPage, /matchesTripIdentity/);
  assert.match(mapPage, /formatTransitScopeMessage/);
  assert.match(mapPage, /onOptimizationResult=\{handleOptimizationResult\}/);
  assert.match(mapPage, /Couldn’t suggest an order for \$\{modeLabel\}\. Your current order was kept\./);
  assert.match(mapPage, /savedOrigin && !isTripAtLimit\(stops\.length\)/);
});
