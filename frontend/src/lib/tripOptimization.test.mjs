import test from "node:test";
import assert from "node:assert/strict";
import {
  tripFingerprint,
  isValidWaypointOrder,
  applyWaypointOrder,
  isValidFixedEndpointOrder,
  applyFixedEndpointOrder,
  calculateRouteSavings,
  formatDistanceMeters,
  formatDurationSeconds,
  buildOptimizationComparison,
  buildArrivalTimeline,
  normalizeLegMetrics,
  matchesTripIdentity,
} from "./tripOptimization.js";
import * as tripOptimization from "./tripOptimization.js";
import { operatingStatusAt } from "./operatingHours.js";

const stops = [
  { id: "start", lat: 2.1, lng: 102.1, isMe: true },
  { id: "a", lat: 2.2, lng: 102.2 },
  { id: "b", lat: 2.3, lng: 102.3 },
  { id: "end", lat: 2.4, lng: 102.4 },
];

test("fingerprint changes with mode, order, or coordinates", () => {
  assert.equal(tripFingerprint(stops, "DRIVING"), tripFingerprint([...stops], "DRIVING"));
  assert.notEqual(tripFingerprint(stops, "DRIVING"), tripFingerprint(stops, "WALKING"));
  assert.notEqual(
    tripFingerprint(stops, "DRIVING"),
    tripFingerprint([stops[0], stops[2], stops[1], stops[3]], "DRIVING"),
  );
  assert.notEqual(
    tripFingerprint(stops, "DRIVING"),
    tripFingerprint([{ ...stops[0], lat: 2.11 }, ...stops.slice(1)], "DRIVING"),
  );
});

test("route identities only match the exact current mode and stop snapshot", () => {
  const identity = {
    mode: "DRIVING",
    tripFingerprint: tripFingerprint(stops, "DRIVING"),
    routeIndex: 1,
  };
  assert.equal(matchesTripIdentity(identity, stops, "DRIVING", 1), true);
  assert.equal(matchesTripIdentity(identity, stops, "DRIVING", 0), false);
  assert.equal(matchesTripIdentity(identity, stops, "WALKING", 1), false);
  assert.equal(matchesTripIdentity(identity, [stops[0], stops[2], stops[1], stops[3]], "DRIVING", 1), false);
  assert.equal(matchesTripIdentity(null, stops, "DRIVING", 1), false);
  assert.equal(matchesTripIdentity({ ...identity, routeIndex: undefined }, stops, "DRIVING"), true);
});

test("waypoint order must be a complete in-range permutation", () => {
  assert.equal(isValidWaypointOrder([1, 0], 2), true);
  assert.equal(isValidWaypointOrder([], 0), true);
  assert.equal(isValidWaypointOrder([0, 0], 2), false);
  assert.equal(isValidWaypointOrder([0], 2), false);
  assert.equal(isValidWaypointOrder([0, 2], 2), false);
  assert.equal(isValidWaypointOrder([0, 1.5], 2), false);
  assert.equal(isValidWaypointOrder(null, 2), false);
});

test("applying a waypoint order preserves exact endpoints", () => {
  const result = applyWaypointOrder(stops, [1, 0]);
  assert.deepEqual(result.map((stop) => stop.id), ["start", "b", "a", "end"]);
  assert.equal(result[0], stops[0]);
  assert.equal(result.at(-1), stops.at(-1));
  assert.equal(applyWaypointOrder(stops, [0, 0]), null);
  assert.equal(applyWaypointOrder([], []), null);
});

test("OSRM full order must be a complete permutation with fixed endpoints", () => {
  assert.equal(isValidFixedEndpointOrder([0, 2, 1, 3], 4), true);
  assert.equal(isValidFixedEndpointOrder([1, 2, 0, 3], 4), false);
  assert.equal(isValidFixedEndpointOrder([0, 3, 2, 1], 4), false);
  assert.equal(isValidFixedEndpointOrder([0, 1, 1, 3], 4), false);
  assert.equal(isValidFixedEndpointOrder([0, 1, 3], 4), false);
  assert.equal(isValidFixedEndpointOrder([0, 1, 2, 4], 4), false);
});

test("applying an OSRM full order moves only intermediate stops", () => {
  const result = applyFixedEndpointOrder(stops, [0, 2, 1, 3]);
  assert.deepEqual(result.map((stop) => stop.id), ["start", "b", "a", "end"]);
  assert.equal(result[0], stops[0]);
  assert.equal(result.at(-1), stops.at(-1));
  assert.equal(applyFixedEndpointOrder(stops, [1, 2, 0, 3]), null);
});

test("savings and approved copy use numeric Google totals", () => {
  assert.deepEqual(
    calculateRouteSavings(
      { meters: 46200, seconds: 4440 },
      { meters: 34800, seconds: 3120 },
    ),
    { distanceMeters: 11400, durationSeconds: 1320, improved: true },
  );
  assert.equal(formatDistanceMeters(11400), "11.4 km");
  assert.equal(formatDistanceMeters(450), "450 m");
  assert.equal(formatDurationSeconds(1320), "22 min");
  assert.equal(formatDurationSeconds(4440), "1h 14min");
  assert.equal(
    buildOptimizationComparison(
      { meters: 46200, seconds: 4440 },
      { meters: 34800, seconds: 3120 },
    ).message,
    "Suggested order saves 11.4 km · 22 min",
  );
  assert.equal(
    buildOptimizationComparison(
      { meters: 34800, seconds: 3120 },
      { meters: 34800, seconds: 3120 },
    ).message,
    "Your current order is already the best suggestion.",
  );
});

test("Google leg metrics reject missing, non-finite, and negative values", () => {
  assert.deepEqual(normalizeLegMetrics([
    { distance: { value: 1200 }, duration: { value: 300 } },
    { distance: { value: 800 }, duration: { value: 240 } },
  ]), {
    meters: 2000,
    seconds: 540,
    legDistancesMeters: [1200, 800],
    legDurationsSeconds: [300, 240],
  });
  assert.equal(normalizeLegMetrics([{ distance: {}, duration: { value: 60 } }]), null);
  assert.equal(normalizeLegMetrics([{ distance: { value: 20 }, duration: {} }]), null);
  assert.equal(normalizeLegMetrics([{ distance: { value: -1 }, duration: { value: 60 } }]), null);
  assert.equal(normalizeLegMetrics([{ distance: { value: 20 }, duration: { value: Number.NaN } }]), null);
});

test("arrival timeline adds one hour only after vendor restaurants", () => {
  const routeStops = [
    { id: "start", isMe: true },
    { id: "vendor-a", vendor: { operating_hours_raw: "09:00 AM - 10:00 PM" } },
    { id: "custom", source: "custom" },
    { id: "vendor-b", vendor: { operating_hours_raw: "09:00 AM - 10:00 PM" } },
  ];
  const rows = buildArrivalTimeline(
    routeStops,
    [20 * 60, 15 * 60, 10 * 60],
    new Date("2026-09-13T04:00:00.000Z"),
    [142400, 320, 850],
  );
  assert.equal(rows[0].text, "Start 12:00 PM");
  assert.equal(rows[0].fromStopId, null);
  assert.equal(rows[0].legDistance, null);
  assert.match(rows[1].text, /^Arrive 12:20 PM/);
  assert.equal(rows[1].fromStopId, "start");
  assert.equal(rows[1].legDistance, "142.4 km");
  assert.match(rows[2].text, /^Arrive 1:35 PM/);
  assert.equal(rows[2].fromStopId, "vendor-a");
  assert.equal(rows[2].legDistance, "320 m");
  assert.match(rows[3].text, /^Arrive 1:45 PM/);
  assert.equal(rows[3].fromStopId, "custom");
  assert.equal(rows[3].legDistance, "850 m");
});

test("arrival timeline rejects missing or invalid Google leg durations", () => {
  const distances = [100, 200, 300];
  assert.deepEqual(buildArrivalTimeline(stops, [60], new Date(), distances), []);
  assert.deepEqual(buildArrivalTimeline(stops, [60, -1, 60], new Date(), distances), []);
  assert.deepEqual(buildArrivalTimeline(stops, [60, Number.NaN, 60], new Date(), distances), []);
});

test("arrival timeline rejects missing or invalid Google leg distances", () => {
  const durations = [60, 120, 180];
  assert.deepEqual(buildArrivalTimeline(stops, durations, new Date()), []);
  assert.deepEqual(buildArrivalTimeline(stops, durations, new Date(), [100]), []);
  assert.deepEqual(buildArrivalTimeline(stops, durations, new Date(), [100, -1, 300]), []);
  assert.deepEqual(buildArrivalTimeline(stops, durations, new Date(), [100, Number.NaN, 300]), []);
});

test("arrival guidance distinguishes 24-hour, open, closing soon, closed, and unknown", () => {
  const at = new Date("2026-09-13T13:30:00.000Z");
  assert.equal(operatingStatusAt({ operating_hours_raw: "24 hours" }, at).kind, "open-24");
  assert.equal(operatingStatusAt({ operating_hours_raw: "09:00 AM - 11:00 PM" }, at).kind, "open");
  assert.equal(operatingStatusAt({ operating_hours_raw: "09:00 AM - 10:00 PM" }, at).kind, "closing-soon");
  assert.equal(operatingStatusAt({ operating_hours_raw: "09:00 AM - 09:00 PM" }, at).kind, "closed");
  assert.equal(operatingStatusAt({ operating_hours_raw: "schedule pending" }, at).kind, "unavailable");
});

test("static stop status uses current Malaysia hours and exact customer copy", () => {
  assert.equal(typeof tripOptimization.stopStatusPresentation, "function");
  const noon = new Date("2026-09-14T04:00:00.000Z");
  const evening = new Date("2026-09-14T10:00:00.000Z");

  assert.deepEqual(
    tripOptimization.stopStatusPresentation({ operating_hours_raw: "08:00 AM - 05:00 PM" }, null, noon),
    { text: "Open now · 08:00 AM – 05:00 PM", tone: "success" },
  );
  assert.deepEqual(
    tripOptimization.stopStatusPresentation({ operating_hours_raw: "08:00 AM - 05:00 PM" }, null, evening),
    { text: "Closed · 08:00 AM – 05:00 PM", tone: "danger" },
  );
  assert.deepEqual(
    tripOptimization.stopStatusPresentation({ operating_hours_raw: "24 hours" }, null, evening),
    { text: "Open now · 24 hours", tone: "success" },
  );
  assert.deepEqual(
    tripOptimization.stopStatusPresentation({ operating_hours_raw: "schedule pending" }, null, noon),
    { text: "Hours unavailable", tone: "muted" },
  );
  assert.deepEqual(
    tripOptimization.stopStatusPresentation({
      operating_hours_raw: "schedule pending",
      operating_hours: "08:00 AM - 05:00 PM",
    }, null, noon),
    { text: "Open now · 08:00 AM – 05:00 PM", tone: "success" },
  );
});

test("Google arrival wins and non-vendors receive no static hours", () => {
  assert.equal(typeof tripOptimization.stopStatusPresentation, "function");
  const arrival = {
    text: "Arrive 2:27 AM · Hours unavailable",
    tone: "muted",
    legDistance: "710 m",
  };
  assert.equal(
    tripOptimization.stopStatusPresentation({ operating_hours_raw: "08:00 AM - 05:00 PM" }, arrival),
    arrival,
  );
  assert.equal(tripOptimization.stopStatusPresentation(null, null), null);
});

test("overnight arrival uses Malaysia time across midnight", () => {
  assert.equal(
    operatingStatusAt(
      { operating_hours_raw: "10:00 PM - 02:00 AM" },
      new Date("2026-09-13T17:30:00.000Z"),
    ).kind,
    "closing-soon",
  );
});

test("operating boundaries treat opening as inclusive, closing as exclusive, and sixty minutes as soon", () => {
  const vendor = { operating_hours_raw: "09:00 AM - 10:00 PM" };
  assert.equal(operatingStatusAt(vendor, new Date("2026-09-13T01:00:00.000Z")).kind, "open");
  assert.equal(operatingStatusAt(vendor, new Date("2026-09-13T13:00:00.000Z")).kind, "closing-soon");
  assert.equal(operatingStatusAt(vendor, new Date("2026-09-13T14:00:00.000Z")).kind, "closed");
  assert.equal(
    operatingStatusAt(
      { operating_hours_raw: "10:00 PM - 02:00 AM" },
      new Date("2026-09-13T18:00:00.000Z"),
    ).kind,
    "closed",
  );
});
