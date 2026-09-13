export const MAX_GOOGLE_TRIP_STOPS = 27;

export const TRIP_LIMIT_ADD_MESSAGE =
  "A trip can include up to 27 stops for Google routing. Remove a stop before adding another.";

export const EMPTY_ROUTE_SUMMARY = Object.freeze({ distance: "—", duration: "—" });

export function isTripAtLimit(stopCount) {
  return stopCount >= MAX_GOOGLE_TRIP_STOPS;
}

export function formatTripOverflowMessage(stopCount) {
  const excessCount = Math.max(0, stopCount - MAX_GOOGLE_TRIP_STOPS);
  if (excessCount === 0) return null;
  return `This trip has ${stopCount} stops. Google routing supports up to 27. Remove ${excessCount} stops to calculate the route.`;
}

export function getRouteConstraint(travelMode, stopCount) {
  const overflow = formatTripOverflowMessage(stopCount);
  if (overflow) return { code: "MAX_WAYPOINTS_EXCEEDED", message: overflow };

  return null;
}

export function selectRoutingStops(stops, travelMode) {
  if (!Array.isArray(stops) || stops.length < 2 || travelMode !== "TRANSIT") {
    return Array.isArray(stops) ? stops : [];
  }

  const origin = stops.find((stop) => stop.isMe) || stops[0];
  const destination = [...stops].reverse().find((stop) => !stop.isMe && stop !== origin);
  return destination ? [origin, destination] : [origin];
}

export function formatTransitScopeMessage(fullStops, routingStops) {
  if (!Array.isArray(fullStops) || !Array.isArray(routingStops)) return null;
  const intermediateCount = fullStops.length - routingStops.length;
  if (intermediateCount <= 0 || routingStops.length < 2) return null;
  return `Transit route includes only the start and final destination. ${intermediateCount} intermediate stops are not included.`;
}

function errorText(error) {
  if (typeof error === "string") return error;
  return [error?.code, error?.status, error?.message].filter(Boolean).join(" ");
}

export function getDirectionsErrorMessage(error, stopCount) {
  if (!error) return null;
  const text = errorText(error);
  if (text.includes("MAX_WAYPOINTS_EXCEEDED")) {
    return formatTripOverflowMessage(stopCount) || TRIP_LIMIT_ADD_MESSAGE;
  }
  if (text.includes("ZERO_RESULTS")) return "No route was found for these stops.";
  if (text.includes("REQUEST_DENIED")) {
    return "Google routing is unavailable. Please check the Maps API configuration.";
  }
  if (text.includes("OVER_QUERY_LIMIT")) {
    return "Google routing is temporarily unavailable. Please try again shortly.";
  }
  return "Route calculation failed. Please try again.";
}
