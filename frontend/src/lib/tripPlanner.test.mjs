import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STOP_TYPES, newStopId, isResolvedStop, newDraft, rowsFor,
  nearlySamePlace, groupStopsByPosition, migrateStop, plannedStopCount,
} from "./tripStops.js";
import { loadTrip, saveTrip, reconcileTripOwner } from "./tripStorage.js";
import { distanceLabel } from "./vendorDisplay.js";
import { sortVendors } from "./vendorFilters.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const mapPage = read("../pages/MapPage.jsx");
const tripPanel = read("../components/TripPanel.jsx");
const storage = read("./tripStorage.js");

function installBrowserStorage() {
  const values = new Map();
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    dispatchEvent() {},
  };
  return values;
}

const anchor = { id: "anchor-1", type: "anchor", name: "Melaka", lat: 2.1896, lng: 102.2501 };
const vendorA = { id: "vendor-stop-1", type: "vendor", vendorId: "v1", name: "Kedai", lat: 2.2, lng: 102.26 };
const vendorAAgain = { ...vendorA, id: "vendor-stop-2" };
const drift = { id: "custom-1", type: "custom", name: "Same spot", lat: 2.18965, lng: 102.25012 };
const street = { id: "custom-2", type: "custom", name: "Across the road", lat: 2.1898, lng: 102.2501 };

test("stop types describe business role rather than GPS versus search", () => {
  assert.deepEqual(STOP_TYPES, ["anchor", "vendor", "custom"]);
  assert.equal(isResolvedStop(anchor), true);
  assert.equal(isResolvedStop(vendorA), true);
  assert.equal(isResolvedStop({ ...vendorA, vendorId: undefined }), false);
  assert.equal(isResolvedStop(newDraft("anchor")), false);
});

test("an anchor draft reserves row 1 and custom drafts follow resolved stops", () => {
  const anchorDraft = newDraft("anchor");
  const customDraft = newDraft("custom");
  assert.deepEqual(rowsFor([vendorA], [anchorDraft, customDraft]).map((row) => [row.type, row.number, row.draft]), [
    ["anchor", 1, true], ["vendor", 2, false], ["custom", 3, true],
  ]);
});

test("repeat vendor occurrences have unique stop ids but one vendor id", () => {
  assert.notEqual(newStopId("vendor-stop"), newStopId("vendor-stop"));
  assert.equal(vendorA.vendorId, vendorAAgain.vendorId);
  assert.notEqual(vendorA.id, vendorAAgain.id);
});

test("same spot means 15 metres and repeated vendors merge", () => {
  assert.equal(nearlySamePlace(anchor, drift), true);
  assert.equal(nearlySamePlace(anchor, street), false);
  const groups = groupStopsByPosition(rowsFor([anchor, vendorA, vendorAAgain, drift, street], []));
  assert.deepEqual(groups.map((group) => group.stops.map((stop) => stop.number)), [[1, 4], [2, 3], [5]]);
});

test("legacy isMe becomes anchor and legacy vendor id becomes vendorId", () => {
  const oldAnchor = migrateStop({ id: "__me__", name: "Your location", lat: 1, lng: 2, isMe: true });
  const oldVendor = migrateStop({ id: "v1", name: "Kedai", lat: 1, lng: 2, isMe: false });
  assert.equal(oldAnchor.type, "anchor");
  assert.equal(oldVendor.type, "vendor");
  assert.equal(oldVendor.vendorId, "v1");
  assert.equal("isMe" in oldAnchor, false);
  assert.equal(oldAnchor.name, "", "legacy placeholder name is dropped so GPS can relabel it");
  assert.equal(migrateStop({ id: "__me__", name: "Jalan Hang Tuah", lat: 1, lng: 2, isMe: true }).name, "Jalan Hang Tuah");
  assert.equal(migrateStop({ id: "anchor-1", type: "anchor", name: "Your location", lat: 1, lng: 2 }).name, "", "already-migrated anchors get the same treatment");
  const misfiled = migrateStop({ id: "custom-1", type: "vendor", vendorId: "custom-1", name: "R1, Jalan Tun Razak", lat: 1, lng: 2 });
  assert.equal(misfiled.type, "custom");
  assert.equal("vendorId" in misfiled, false);
  const editedMe = migrateStop({ id: "__me__", type: "vendor", vendorId: "__me__", name: "R1, Jalan Tun Razak", lat: 1, lng: 2 });
  assert.equal(editedMe.type, "custom");
  assert.notEqual(editedMe.id, "__me__", "must not collide with the anchor's legacy id");
  assert.equal(migrateStop({ id: "__me__", name: "Typed", lat: 1, lng: 2, isMe: false }).type, "custom");
});

test("storage keeps type/vendorId, strips vendor snapshots, and permits repeats", () => {
  installBrowserStorage();
  saveTrip([anchor, vendorA, vendorAAgain], "WALKING", "guest");
  const back = loadTrip("guest");
  assert.deepEqual(back.stops.map(({ type, vendorId }) => [type, vendorId]), [
    ["vendor", "v1"], ["vendor", "v1"],
  ]);
  assert.equal(back.stops.some((stop) => "vendor" in stop), false);
  assert.equal(back.travelMode, "WALKING");
});

test("only the three anchor entry points write the anchor", () => {
  assert.match(mapPage, /function placeAnchor\(place, \{ onlyIfEmpty = false \} = \{\}\)/);
  assert.doesNotMatch(mapPage, /anchorSeededOwnerRef/);
  assert.match(mapPage, /saveMapOrigin\(origin\)/);
  const entry = mapPage.slice(mapPage.indexOf("locationRequestedRef.current = true"), mapPage.indexOf("locationRequestedRef.current = true") + 700);
  assert.match(entry, /placeAnchor\(labelled, \{ onlyIfEmpty: true \}\)/);
  const fab = mapPage.slice(mapPage.indexOf("function locateMe"), mapPage.indexOf("function locateMe") + 700);
  assert.match(fab, /placeAnchor\(labelled\)/);
  assert.doesNotMatch(fab, /setUserPos\(MELAKA_CENTER\)/);
});

test("storage discards legacy durable anchors and unresolved rows", () => {
  installBrowserStorage();
  window.localStorage.setItem("truebites:trip", JSON.stringify({ owner: "guest", travelMode: "DRIVING", stops: [anchor, newDraft("custom")] }));
  assert.deepEqual(loadTrip("guest").stops, []);
  window.localStorage.setItem("truebites:trip", JSON.stringify({ owner: "guest", travelMode: "DRIVING", stops: [anchor, { ...anchor, id: "anchor-2" }] }));
  assert.deepEqual(loadTrip("guest").stops, []);
});

test("the Google cap counts drafts and the reserved anchor row", () => {
  assert.equal(plannedStopCount([], []), 1, "an empty trip still owes the anchor row");
  assert.equal(plannedStopCount([], [newDraft("anchor")]), 1);
  assert.equal(plannedStopCount([anchor, vendorA], [newDraft("custom")]), 3);
  assert.equal(plannedStopCount([vendorA, vendorAAgain], []), 3, "no anchor stored → one row reserved");
});

test("Google draws every route while OSRM optimises only Car stop order", () => {
  assert.doesNotMatch(mapPage, /TripPolyline|tripData/);
  assert.match(mapPage, /travelMode === "DRIVING"[\s\S]*getTrip/);
  assert.match(mapPage, /const routingStops = useMemo\([\s\S]*selectRoutingStops\(trip, travelMode\)/);
  assert.match(mapPage, /<DirectionsRenderer[\s\S]*?stops=\{routingStops\}/);
  assert.match(mapPage, /summary=\{displayedSummary\}/);
  const directions = read("../components/DirectionsRenderer.jsx");
  assert.match(directions, /optimizeWaypoints:\s*true/);
  assert.match(directions, /requestedMode === "TRANSIT" \|\| requestedMode === "DRIVING"/);
  assert.match(directions, /avoidTolls:\s*true/);
});

test("route choice reuses the cached Google result", () => {
  const directions = read("../components/DirectionsRenderer.jsx");
  assert.match(directions, /const resultRef = useRef\(null\)/);
  assert.match(directions, /\}, \[map, stops, travelMode\]\);/);
  assert.doesNotMatch(directions, /\[map, stops, travelMode, routeIndex\]/);
});

test("a failed route keeps stops and explains the failure", () => {
  assert.match(mapPage, /getDirectionsErrorMessage\(dirError, trip\.length\)/);
  assert.match(tripPanel, /buildGoogleMapsUrl\(trip, travelMode\)/);
  const directions = read("../components/DirectionsRenderer.jsx");
  const short = directions.slice(directions.indexOf("stops.length < 2"), directions.indexOf("stops.length < 2") + 500);
  assert.match(short, /clearRoute\(identity\)/);
  assert.match(directions, /publishSummary\?\.\(null\)/);
  assert.match(directions, /publishRoutes\?\.\(\[\]\)/);
  assert.match(directions, /publishTransit\?\.\(\[\]\)/);
});

const stopMarkers = read("../components/TripStopMarkers.jsx");
const vendorMarkers = read("../components/VendorMarkers.jsx");

test("TripStopMarkers alone renders numbered occurrences", () => {
  assert.match(stopMarkers, /rowsFor\(trip, draftStops\)/);
  assert.match(stopMarkers, /groupStopsByPosition\(numberedStops\)/);
  assert.match(stopMarkers, /stops\.map\(\(stop\) => stop\.number\)\.join\(" · "\)/);
  assert.doesNotMatch(stopMarkers, /MarkerClusterer|clusterer/);
  assert.match(mapPage, /const clusterVendors = visibleVendors\.filter\(\(vendor\) => !tripVendorIds\.has\(vendor\.id\)\)/);
  assert.match(mapPage, /<VendorMarkers[\s\S]*?vendors=\{clusterVendors\}/);
  assert.match(mapPage, /<TripStopMarkers trip=\{trip\} draftStops=\{draftStops\} userPos=\{userPos\} \/>/);
  assert.doesNotMatch(vendorMarkers, /tripOrder|userStopNumber|inTripIds/);
});

test("selected vendor markers are reattached after cluster refresh", () => {
  const refresh = vendorMarkers.slice(vendorMarkers.indexOf("const refreshCluster"), vendorMarkers.indexOf("const refreshCluster") + 650);
  assert.match(refresh, /clearMarkers\(\)/);
  assert.match(refresh, /excluded\.current/);
  assert.match(refresh, /marker\.map = map/);
});

test("camera fits stop positions but ignores reorder", () => {
  assert.match(mapPage, /function FitToTrip/);
  assert.match(mapPage, /trip\.map\([\s\S]*?\.sort\(\)\.join\("\|"\)/);
  assert.match(mapPage, /groups\.length === 1[\s\S]*?panTo/);
  assert.match(mapPage, /top: 96, right: panelVisible \? 372 : 48, bottom: 48, left: 48/);
  assert.match(mapPage, /<FitToTrip trip=\{trip\} panelVisible=\{!mapFullscreen && !tripCollapsed\} \/>/);
});

test("vendor map InfoWindow always keeps its add action", () => {
  assert.match(vendorMarkers, />\s*➕ Add stop\s*</);
  assert.doesNotMatch(vendorMarkers, /disabled=\{.*trip|Already|In your trip|✓ Stop/);
});

const locationInput = read("../components/LocationInput.jsx");

test("trip rows are inline search inputs", () => {
  assert.doesNotMatch(tripPanel, /addingPlace|editingId|Pencil|Search a place to add/);
  assert.match(tripPanel, /rowsFor\(trip, draftStops\)/);
  assert.match(tripPanel, /row\.type !== "vendor"/);
  assert.match(tripPanel, /draggable=\{!row\.draft\}/);
  assert.match(tripPanel, /data-stop-id=\{row\.id\}/);
  assert.match(tripPanel, /<Plus size=\{13\} \/> Add stop/);
  assert.doesNotMatch(tripPanel, /\+ Add stop/); // the icon is the plus; a literal "+" doubled it
});

test("the anchor row is distinct, editable, draggable when resolved, and undeletable", () => {
  assert.match(tripPanel, /const isAnchor = row\.type === "anchor"/);
  assert.match(tripPanel, />Search area</);
  assert.match(tripPanel, /Choose search area…/);
  assert.match(tripPanel, /!isAnchor && \(/);
  assert.match(tripPanel, /bg-\[#EAF6EE\]/);
  assert.doesNotMatch(tripPanel, /index === 0.*anchor|isOrigin/);
});

test("LocationInput uses full addresses and rejects unselected text", () => {
  assert.match(locationInput, /defaultValue/);
  assert.match(locationInput, /autoFocus/);
  assert.match(locationInput, /onSelectRef\.current/);
  assert.match(locationInput, /"formatted_address"/);
  assert.match(locationInput, /place\.formatted_address \|\| place\.name/);
  assert.match(locationInput, /onBlur=\{revertIfUnselected\}/);
  assert.match(locationInput, /event\.key === "Escape"/);
  assert.match(locationInput, /onGps && \(/);
});

test("GPS changes coordinates but never changes stop type", () => {
  for (const name of ["function addDraftStop", "function resolveDraft", "function retargetStop", "function useGpsForRow"]) {
    assert.match(mapPage, new RegExp(name));
  }
  const retarget = mapPage.slice(mapPage.indexOf("function retargetStop"), mapPage.indexOf("function retargetStop") + 500);
  assert.doesNotMatch(retarget, /type:/);
  const gps = mapPage.slice(mapPage.indexOf("function useGpsForRow"), mapPage.indexOf("function useGpsForRow") + 900);
  assert.doesNotMatch(gps, /type:\s*"anchor"|type:\s*"custom"/);
  assert.match(gps, /row\?\.type === "anchor"\) \{[\s\S]{0,40}locateMe\(\)/);
  assert.doesNotMatch(gps, /placeAnchor/);
  assert.equal((mapPage.match(/placeAnchor\(/g) || []).length, 3); // definition + entry + locateMe
});

test("route controls gate on stop count, not stop type", () => {
  assert.doesNotMatch(tripPanel, /vendorStops/);
  assert.match(tripPanel, /\{trip\.length >= 2 && \([\s\S]{0,80}onSuggestBestOrder/);
  assert.doesNotMatch(tripPanel, /\.length >= 1 &&/);
  assert.match(tripPanel, /disabled=\{[^}]*travelMode === "TRANSIT"/);
});

const vendorPanel = read("../components/VendorPanel.jsx");
const dashboard = read("../components/Dashboard.jsx");
const vendorCard = read("../components/discovery/VendorCard.jsx");
const vendorDetail = read("../components/discovery/VendorDetailModal.jsx");

test("distance labels round to at most two decimal places", () => {
  assert.equal(distanceLabel({ distKm: 116.31798358730022 }), "116.32 km");
  assert.equal(distanceLabel({ distKm: 0.441 }), "0.44 km");
  assert.equal(distanceLabel({ distKm: 2 }), "2 km");
  assert.equal(distanceLabel({ distKm: undefined }), null);
  assert.equal(distanceLabel({ distKm: null }), null);
  assert.equal(distanceLabel({}), null);
});

test("nearest order uses anchor distance", () => {
  const rows = sortVendors([{ id: "far", distKm: 3.4 }, { id: "near", distKm: 0.2 }], "nearest");
  assert.deepEqual(rows.map((row) => row.id), ["near", "far"]);
});

test("the map vendor list uses 15-row progressive disclosure", () => {
  assert.match(mapPage, /const \[vendorVisibleCount, setVendorVisibleCount\] = useState\(15\)/);
  assert.match(mapPage, /sortVendors\([\s\S]*?"nearest"/);
  assert.doesNotMatch(mapPage, /\.slice\(0, 12\)/);
  assert.doesNotMatch(mapPage, /!stopIds\.has\(vendor\.id\)/);
  assert.match(vendorPanel, /nearby\.slice\(0, visibleCount\)/);
  assert.match(vendorPanel, /Math\.min\(visibleCount, nearby\.length\)/);
  assert.match(vendorPanel, /Showing \{shown\} of \{nearby\.length\}/);
  assert.match(vendorPanel, />\s*Show 15 more\s*</);
  assert.doesNotMatch(vendorPanel, /tripIds|In trip|Already|disabled/);
});

test("all vendor surfaces remain addable after the first occurrence", () => {
  assert.doesNotMatch(dashboard, /tripVendorIds|isInTrip/);
  assert.doesNotMatch(vendorCard, /inTrip|Already added|>Added</);
  assert.match(vendorCard, /Add to trip/);
  assert.doesNotMatch(vendorDetail, /inTrip|Already in Your Trip|disabled/);
  assert.match(vendorDetail, /\+ Add to Trip/);
});

test("vendor add toast reports the new visible stop number", () => {
  const body = mapPage.slice(mapPage.indexOf("function addStop"), mapPage.indexOf("function addStop") + 650);
  assert.match(body, /rowsFor\(list, draftStops\)/);
  assert.match(body, /added to trip as stop \$\{number\}\./);
  assert.doesNotMatch(body, /trip\.some/);
});

test("a travel mode is always selected", () => {
  assert.match(mapPage, /useState\("DRIVING"\)/);
  assert.match(mapPage, /setTravelMode\(stored\?\.travelMode \|\| "DRIVING"\)/);
  assert.match(storage, /travelMode: parsed\.travelMode \|\| "DRIVING"/);
  assert.doesNotMatch(tripPanel, /onTravelMode\(active \? null : mode\)/);
  assert.match(tripPanel, /onTravelMode\(mode\)/);
});
