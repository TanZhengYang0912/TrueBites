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

  if (travelMode === "TRANSIT" && stopCount > 2) {
    const intermediateCount = stopCount - 2;
    const stopLabel = intermediateCount === 1 ? "stop" : "stops";
    return {
      code: "TRANSIT_WAYPOINTS_UNSUPPORTED",
      message: `Transit routing supports only a start and destination. Remove ${intermediateCount} intermediate ${stopLabel} to calculate this route.`,
    };
  }

  return null;
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
