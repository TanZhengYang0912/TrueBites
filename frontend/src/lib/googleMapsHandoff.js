// Hands the planned trip off to Google Maps for turn-by-turn navigation — we
// don't build in-app navigation ourselves. Adapted from the multi-stop-map
// handoff's buildGoogleMapsDirectionsUrl (see docs/multistop-map-handoff.md).
import { selectRoutingStops } from "./tripRoutingPolicy.js";

const MODE_PARAM = { DRIVING: "driving", TWO_WHEELER: "driving", WALKING: "walking", TRANSIT: "transit" };

// Keep the consumer handoff deliberately conservative and predictable across
// devices: origin and destination are part of this seven-stop total.
const MAX_HANDOFF_STOPS = 7;

export function buildGoogleMapsUrl(stops, travelMode) {
  const selectedStops = selectRoutingStops(stops, travelMode);
  if (selectedStops.length < 2) return null;

  if (travelMode === "TRANSIT") {
    const [origin, destination] = selectedStops;
    const params = new URLSearchParams({
      api: "1",
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      travelmode: MODE_PARAM[travelMode],
    });
    return {
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
      truncated: false,
      includedCount: 2,
      remainingCount: 0,
    };
  }

  const capped = selectedStops.slice(0, MAX_HANDOFF_STOPS);
  const [origin, ...rest] = capped;
  const destination = rest[rest.length - 1];
  const waypoints = rest.slice(0, -1);
  const remainingCount = Math.max(0, selectedStops.length - capped.length);

  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: MODE_PARAM[travelMode] || "driving",
  });
  if (waypoints.length) params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    truncated: remainingCount > 0,
    includedCount: capped.length,
    remainingCount,
  };
}
