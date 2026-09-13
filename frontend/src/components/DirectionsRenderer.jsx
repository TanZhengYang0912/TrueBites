import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}
function formatDuration(seconds) {
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`
    : `${Math.floor(seconds / 60)} min`;
}

// Extracts a flat, ribbon-friendly list of legs (walk + transit legs in order)
// from a transit DirectionsResult, so TransitDetails doesn't need to know
// anything about the Google Directions response shape.
function extractTransitLegs(route) {
  const legs = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      if (step.travel_mode === "TRANSIT" && step.transit) {
        const t = step.transit;
        legs.push({
          kind: "transit",
          vehicle: t.line.vehicle?.type || "BUS",
          lineName: t.line.short_name || t.line.name,
          lineColor: t.line.color || "#40544A",
          textColor: t.line.text_color || "#fff",
          departureStop: t.departure_stop?.name,
          arrivalStop: t.arrival_stop?.name,
          departureTime: t.departure_time?.text,
          arrivalTime: t.arrival_time?.text,
          numStops: t.num_stops,
        });
      } else {
        legs.push({
          kind: "walk",
          instructions: step.instructions?.replace(/<[^>]+>/g, ""),
          duration: step.duration?.text,
        });
      }
    }
  }
  return legs;
}

// Google Directions is the sole route drawer (OSRM only optimises stop order —
// see MapPage's planTrip). A route request is fired once per [map, stops,
// travelMode] change and its result cached in resultRef; picking a different
// alternative (routeIndex) is pure presentation and re-renders the cached
// result instead of firing a new Google request.
export default function DirectionsRenderer({ stops, travelMode, routeIndex = 0, onSummary, onRoutes, onTransitLegs }) {
  const map = useMap();
  const rendererRef = useRef(null);
  const resultRef = useRef(null);
  const callbacksRef = useRef({});
  callbacksRef.current = { onSummary, onRoutes, onTransitLegs };

  function publishRoute(result, index, mode) {
    if (!result?.routes?.length) return;
    const safeIndex = Math.min(index, result.routes.length - 1);
    const route = result.routes[safeIndex];
    rendererRef.current?.setMap(map);
    rendererRef.current?.setDirections(result);
    rendererRef.current?.setRouteIndex(safeIndex);
    const distance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const duration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
    callbacksRef.current.onSummary?.({ distance: formatDistance(distance), duration: formatDuration(duration) });
    callbacksRef.current.onTransitLegs?.(mode === "TRANSIT" ? extractTransitLegs(route) : []);
  }

  useEffect(() => {
    if (!map) return;

    if (!rendererRef.current) {
      // preserveViewport: true — don't let the renderer auto zoom-to-fit the
      // whole route (that's what showed all of KL→Melaka on screen). Once
      // navigation starts we instead keep the camera locked on the user's
      // current position, the same way turn-by-turn nav apps behave.
      rendererRef.current = new google.maps.DirectionsRenderer({ suppressMarkers: true, preserveViewport: true });
    }

    resultRef.current = null;

    if (!stops || stops.length < 2 || !travelMode) {
      rendererRef.current.setMap(null);
      callbacksRef.current.onSummary?.(null);
      callbacksRef.current.onRoutes?.([]);
      callbacksRef.current.onTransitLegs?.([]);
      return;
    }

    // Hide the previous route and clear its summary while the new one loads —
    // a route failure below must never leave a stale summary on screen.
    rendererRef.current.setMap(null);
    callbacksRef.current.onSummary?.(null);
    callbacksRef.current.onRoutes?.([]);
    callbacksRef.current.onTransitLegs?.([]);

    const origin = { lat: stops[0].lat, lng: stops[0].lng };
    const destination = { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng };
    const waypoints = stops.slice(1, -1).map((s) => ({ location: { lat: s.lat, lng: s.lng }, stopover: true }));
    const directionsService = new google.maps.DirectionsService();
    let cancelled = false;

    const baseRequest = {
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode[travelMode],
    };

    if (travelMode === "DRIVING") {
      // Two requests: one with alternatives (default, may include toll roads),
      // one forced off tolls. A route whose summary (the road names Google
      // returns, e.g. "AKLEH/E13") doesn't match the toll-free route is
      // flagged as using tolls — approximate, but needs no paid toll-pricing API.
      Promise.all([
        directionsService.route({ ...baseRequest, provideRouteAlternatives: true }),
        directionsService.route({ ...baseRequest, avoidTolls: true }),
      ])
        .then(([withAlts, tollFree]) => {
          if (cancelled) return;
          const tollFreeSummaries = new Set(tollFree.routes.map((r) => r.summary));
          const routes = withAlts.routes.map((r, i) => {
            const dist = r.legs.reduce((a, l) => a + l.distance.value, 0);
            const dur = r.legs.reduce((a, l) => a + l.duration.value, 0);
            return {
              index: i,
              distance: formatDistance(dist),
              duration: formatDuration(dur),
              hasTolls: !tollFreeSummaries.has(r.summary),
            };
          });
          resultRef.current = withAlts;
          callbacksRef.current.onRoutes?.(routes);
          publishRoute(withAlts, routeIndex, travelMode);
        })
        .catch(() => {
          if (cancelled) return;
          resultRef.current = null;
          callbacksRef.current.onSummary?.({ error: true, distance: "—", duration: "No route available" });
          callbacksRef.current.onRoutes?.([]);
        });
    } else {
      directionsService
        .route(baseRequest)
        .then((result) => {
          if (cancelled) return;
          resultRef.current = result;
          publishRoute(result, routeIndex, travelMode);
        })
        .catch(() => {
          if (cancelled) return;
          resultRef.current = null;
          callbacksRef.current.onSummary?.({ error: true, distance: "—", duration: "No route available" });
          if (travelMode === "TRANSIT") callbacksRef.current.onTransitLegs?.([]);
        });
    }

    return () => {
      cancelled = true;
      rendererRef.current?.setMap(null);
    };
  }, [map, stops, travelMode]);

  // Picking an alternative route (or a mode already routed) is presentation
  // only — it re-renders the cached Google result and makes zero new requests.
  useEffect(() => {
    if (!resultRef.current) return;
    publishRoute(resultRef.current, routeIndex, travelMode);
  }, [routeIndex, travelMode]);

  return null;
}
