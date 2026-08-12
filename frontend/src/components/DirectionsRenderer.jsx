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

export default function DirectionsRenderer({ stops, travelMode, routeIndex = 0, onSummary, onRoutes, onTransitLegs }) {
  const map = useMap();
  const rendererRef = useRef(null);
  // Which travel mode we have already centred for. Recentring belongs to
  // "navigation started", not "the route was recomputed" — reordering stops
  // recomputes the route and used to drag the camera with it.

  useEffect(() => {
    if (!map) return;

    if (!rendererRef.current) {
      // preserveViewport: true — don't let the renderer auto zoom-to-fit the
      // whole route (that's what showed all of KL→Melaka on screen). Once
      // navigation starts we instead keep the camera locked on the user's
      // current position, the same way turn-by-turn nav apps behave.
      rendererRef.current = new google.maps.DirectionsRenderer({ suppressMarkers: true, preserveViewport: true });
    }

    if (!stops || stops.length < 2 || !travelMode) {
      rendererRef.current.setMap(null);
      return;
    }

    rendererRef.current.setMap(map);

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

    function applyResult(result) {
      const route = result.routes[Math.min(routeIndex, result.routes.length - 1)];
      rendererRef.current?.setDirections(result);
      rendererRef.current?.setRouteIndex(Math.min(routeIndex, result.routes.length - 1));
      // The camera is not ours to move. Every change made in the trip panel —
      // reordering, adding, removing, switching travel mode — recomputes this
      // route, and panning on any of them threw away wherever the user had
      // scrolled to. Centring on the user is the GPS button's job.

      const dist = route.legs.reduce((a, l) => a + l.distance.value, 0);
      const dur = route.legs.reduce((a, l) => a + l.duration.value, 0);
      onSummary?.({ distance: formatDistance(dist), duration: formatDuration(dur) });

      if (travelMode === "TRANSIT") {
        onTransitLegs?.(extractTransitLegs(route));
      }
    }

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
          onRoutes?.(routes);
          applyResult(withAlts);
        })
        .catch(() => {
          if (cancelled) return;
          onSummary?.({ error: true, distance: "—", duration: "No route available" });
          onRoutes?.([]);
        });
    } else {
      directionsService
        .route(baseRequest)
        .then((result) => {
          if (cancelled) return;
          applyResult(result);
        })
        .catch(() => {
          if (cancelled) return;
          onSummary?.({ error: true, distance: "—", duration: "No route available" });
          if (travelMode === "TRANSIT") onTransitLegs?.([]);
        });
    }

    return () => {
      cancelled = true;
      rendererRef.current?.setMap(null);
    };
  }, [map, stops, travelMode, routeIndex]);

  return null;
}
