import {
  formatMalaysiaTime,
  operatingStatus,
  operatingStatusAt,
} from "./operatingHours.js";

export const RESTAURANT_VISIT_MINUTES = 60;

export function tripFingerprint(stops, travelMode) {
  return JSON.stringify({
    travelMode: travelMode || null,
    stops: (stops || []).map((stop) => [String(stop.id), Number(stop.lat), Number(stop.lng)]),
  });
}

export function matchesTripIdentity(identity, stops, travelMode, routeIndex) {
  return Boolean(
    identity
    && identity.mode === travelMode
    && identity.tripFingerprint === tripFingerprint(stops, travelMode)
    && (routeIndex === undefined || identity.routeIndex === routeIndex),
  );
}

export function isValidWaypointOrder(order, intermediateCount) {
  if (!Array.isArray(order) || order.length !== intermediateCount) return false;
  return order.every((index) => Number.isInteger(index) && index >= 0 && index < intermediateCount)
    && new Set(order).size === intermediateCount;
}

export function applyWaypointOrder(stops, order) {
  if (!Array.isArray(stops) || stops.length < 2) return null;
  const intermediates = stops.slice(1, -1);
  if (!isValidWaypointOrder(order, intermediates.length)) return null;
  return [stops[0], ...order.map((index) => intermediates[index]), stops.at(-1)];
}

export function calculateRouteSavings(baseline, optimized) {
  const baselineMeters = Number(baseline?.meters);
  const baselineSeconds = Number(baseline?.seconds);
  const optimizedMeters = Number(optimized?.meters);
  const optimizedSeconds = Number(optimized?.seconds);
  if (![baselineMeters, baselineSeconds, optimizedMeters, optimizedSeconds].every(Number.isFinite)) {
    return { distanceMeters: 0, durationSeconds: 0, improved: false };
  }
  const distanceMeters = Math.max(0, baselineMeters - optimizedMeters);
  const durationSeconds = Math.max(0, baselineSeconds - optimizedSeconds);
  return {
    distanceMeters,
    durationSeconds,
    improved: distanceMeters > 0 || durationSeconds > 0,
  };
}

export function formatDistanceMeters(meters) {
  const rounded = Math.max(0, Math.round(Number(meters) || 0));
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(1)} km` : `${rounded} m`;
}

export function formatDurationSeconds(seconds) {
  const totalMinutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  return totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`
    : `${totalMinutes} min`;
}

export function buildOptimizationComparison(baseline, optimized) {
  const savings = calculateRouteSavings(baseline, optimized);
  return {
    ...savings,
    message: savings.improved
      ? `Suggested order saves ${formatDistanceMeters(savings.distanceMeters)} · ${formatDurationSeconds(savings.durationSeconds)}`
      : "Your current order is already the best suggestion.",
  };
}

export function normalizeLegMetrics(legs) {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const values = legs.map((leg) => ({
    meters: Number(leg?.distance?.value),
    seconds: Number(leg?.duration?.value),
  }));
  if (!values.every(({ meters, seconds }) =>
    Number.isFinite(meters) && meters >= 0 && Number.isFinite(seconds) && seconds >= 0)) {
    return null;
  }
  return {
    meters: values.reduce((total, value) => total + value.meters, 0),
    seconds: values.reduce((total, value) => total + value.seconds, 0),
    legDistancesMeters: values.map((value) => value.meters),
    legDurationsSeconds: values.map((value) => value.seconds),
  };
}

function arrivalPresentation(vendor, arrivalAt) {
  const time = formatMalaysiaTime(arrivalAt);
  const status = operatingStatusAt(vendor, arrivalAt);
  if (status.kind === "open-24") {
    return { text: `Arrive ${time} · Open 24 hours`, tone: "success" };
  }
  if (status.kind === "open") {
    return { text: `Arrive ${time} · Open until ${status.closeText.toUpperCase()}`, tone: "success" };
  }
  if (status.kind === "closing-soon") {
    return { text: `Arrive ${time} · Closing soon`, tone: "warning" };
  }
  if (status.kind === "closed") {
    return { text: `Arrive ${time} · Likely closed`, tone: "danger" };
  }
  return { text: `Arrive ${time} · Hours unavailable`, tone: "muted" };
}

export function stopStatusPresentation(vendor, arrival, now = new Date()) {
  if (arrival) return arrival;
  if (!vendor) return null;

  const hours = operatingStatus(vendor, now);
  if (!hours) return { text: "Hours unavailable", tone: "muted" };

  const hoursLabel = hours.label.replace(
    /\b(am|pm)\b/gi,
    (period) => period.toUpperCase(),
  );
  return {
    text: `${hours.isOpen ? "Open now" : "Closed"} · ${hoursLabel}`,
    tone: hours.isOpen ? "success" : "danger",
  };
}

export function buildArrivalTimeline(
  stops,
  legDurationsSeconds,
  departureAt = new Date(),
  legDistancesMeters,
) {
  if (!Array.isArray(stops) || stops.length < 2) return [];
  if (!Array.isArray(legDurationsSeconds) || legDurationsSeconds.length !== stops.length - 1) return [];
  if (!legDurationsSeconds.every((duration) => Number.isFinite(duration) && duration >= 0)) return [];
  if (!Array.isArray(legDistancesMeters) || legDistancesMeters.length !== stops.length - 1) return [];
  if (!legDistancesMeters.every((distance) => Number.isFinite(distance) && distance >= 0)) return [];
  if (!(departureAt instanceof Date) || !Number.isFinite(departureAt.getTime())) return [];

  const rows = [{
    stopId: stops[0].id,
    fromStopId: null,
    legDistance: null,
    arrivalAt: new Date(departureAt),
    text: `Start ${formatMalaysiaTime(departureAt)}`,
    tone: "neutral",
  }];
  let elapsedSeconds = 0;

  for (let index = 1; index < stops.length; index += 1) {
    elapsedSeconds += legDurationsSeconds[index - 1];
    const stop = stops[index];
    const arrivalAt = new Date(departureAt.getTime() + elapsedSeconds * 1000);
    const presentation = stop.vendor
      ? arrivalPresentation(stop.vendor, arrivalAt)
      : { text: `Arrive ${formatMalaysiaTime(arrivalAt)}`, tone: "neutral" };
    rows.push({
      stopId: stop.id,
      fromStopId: stops[index - 1].id,
      legDistance: formatDistanceMeters(legDistancesMeters[index - 1]),
      arrivalAt,
      ...presentation,
    });
    if (stop.vendor && index < stops.length - 1) {
      elapsedSeconds += RESTAURANT_VISIT_MINUTES * 60;
    }
  }

  return rows;
}
