import pkg from "@googlemaps/polyline-codec";

const { decode } = pkg;

function googleRouteToResponse(route) {
  const leg = route.legs[0];
  const path = leg.steps.flatMap((step) =>
    decode(step.polyline.points).map(([lat, lng]) => ({ lat, lng })),
  );

  return {
    distance: leg.distance.text,
    duration: leg.duration.text,
    path,
  };
}

function osrmRouteToResponse(route) {
  return {
    distance: `${(route.distance / 1000).toFixed(1)} km`,
    duration: `${Math.round(route.duration / 60)} mins`,
    path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  };
}

export async function fetchDrivingRoute(
  { fromLat, fromLng, toLat, toLng },
  { googleApiKey = "", fetchImpl = fetch } = {},
) {
  let googleStatus = "SKIPPED";

  if (googleApiKey) {
    try {
      const googleUrl = new URL("https://maps.googleapis.com/maps/api/directions/json");
      googleUrl.searchParams.set("origin", `${fromLat},${fromLng}`);
      googleUrl.searchParams.set("destination", `${toLat},${toLng}`);
      googleUrl.searchParams.set("mode", "driving");
      googleUrl.searchParams.set("key", googleApiKey);

      const googleData = await (await fetchImpl(googleUrl)).json();
      googleStatus = googleData.status || "UNKNOWN";
      if (googleStatus === "OK" && googleData.routes?.[0]?.legs?.[0]) {
        return googleRouteToResponse(googleData.routes[0]);
      }
    } catch {
      googleStatus = "REQUEST_FAILED";
    }
  }

  let fallbackStatus = "REQUEST_FAILED";
  try {
    const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/${coords}` +
      "?overview=full&geometries=geojson";
    const osrmData = await (await fetchImpl(osrmUrl)).json();
    fallbackStatus = osrmData.code || "UNKNOWN";
    if (fallbackStatus === "Ok" && osrmData.routes?.[0]) {
      return osrmRouteToResponse(osrmData.routes[0]);
    }
  } catch {
    // The combined provider status is returned by the route handler below.
  }

  const error = new Error("directions failed");
  error.googleStatus = googleStatus;
  error.fallbackStatus = fallbackStatus;
  throw error;
}
