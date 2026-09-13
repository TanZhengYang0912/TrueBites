import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { normalizeLegMetrics, tripFingerprint } from "../lib/tripOptimization";

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}
function formatDuration(seconds) {
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`
    : `${Math.floor(seconds / 60)} min`;
}

function routeMetrics(route) {
  const metrics = normalizeLegMetrics(route?.legs);
  if (!metrics) throw new Error("INVALID_ROUTE_METRICS");
  return metrics;
}

function routeKey(route) {
  const metrics = routeMetrics(route);
  return `${route?.summary || ""}|${metrics.meters}|${metrics.seconds}`;
}

function mergeDrivingResults(primaryResult, tollFreeResult) {
  const primaryRoutes = primaryResult?.routes || [];
  const tollFreeRoutes = tollFreeResult?.routes || [];
  const tollFreeKeys = new Set(tollFreeRoutes.map(routeKey));
  const routes = [...primaryRoutes];
  const routeKeys = new Set(routes.map(routeKey));

  for (const route of tollFreeRoutes) {
    const key = routeKey(route);
    if (!routeKeys.has(key)) {
      routes.push(route);
      routeKeys.add(key);
    }
  }

  return { result: { ...primaryResult, routes }, tollFreeKeys };
}

function directionsRequest(stops, travelMode) {
  return {
    origin: { lat: stops[0].lat, lng: stops[0].lng },
    destination: { lat: stops.at(-1).lat, lng: stops.at(-1).lng },
    waypoints: stops.slice(1, -1).map((stop) => ({
      location: { lat: stop.lat, lng: stop.lng },
      stopover: true,
    })),
    travelMode: google.maps.TravelMode[travelMode] || travelMode,
  };
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

export default function DirectionsRenderer({
  stops,
  travelMode,
  routeIndex = 0,
  optimizationRequest,
  onSummary,
  onRoutes,
  onTransitLegs,
  onRouteDetails,
  onWarnings,
  onCopyrights,
  onOptimizationResult,
  onOptimizationError,
  onError,
}) {
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

    const identity = {
      mode: travelMode,
      routeIndex,
      tripFingerprint: tripFingerprint(stops, travelMode),
    };

    if (!stops || stops.length < 2 || !travelMode) {
      rendererRef.current.setMap(null);
      onSummary?.(null);
      onError?.(null);
      onRoutes?.([]);
      onTransitLegs?.([]);
      onRouteDetails?.(null, identity);
      onWarnings?.([], identity);
      onCopyrights?.("", identity);
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    let cancelled = false;

    const baseRequest = directionsRequest(stops, travelMode);
    const requestedAt = Date.now();
    onError?.(null);

    function applyResult(result) {
      const route = result.routes[Math.min(routeIndex, result.routes.length - 1)];
      rendererRef.current?.setMap(map);
      rendererRef.current?.setDirections(result);
      rendererRef.current?.setRouteIndex(Math.min(routeIndex, result.routes.length - 1));
      // The camera is not ours to move. Every change made in the trip panel —
      // reordering, adding, removing, switching travel mode — recomputes this
      // route, and panning on any of them threw away wherever the user had
      // scrolled to. Centring on the user is the GPS button's job.

      const metrics = routeMetrics(route);
      const { legDistancesMeters } = metrics;
      onError?.(null);
      onSummary?.({ distance: formatDistance(metrics.meters), duration: formatDuration(metrics.seconds) });
      onRouteDetails?.({ ...metrics, legDistancesMeters, calculatedAt: requestedAt, ...identity });
      onWarnings?.(route.warnings || [], identity);
      onCopyrights?.(route.copyrights || "", identity);

      if (travelMode === "TRANSIT") {
        onTransitLegs?.(extractTransitLegs(route));
      }
    }

    if (travelMode === "DRIVING") {
      // Google does not return ordinary alternatives when a request includes
      // intermediate waypoints. Request alternatives only for two-point trips,
      // then merge a distinct avoid-tolls result so multi-stop trips can still
      // offer a genuine toll-free choice when Google finds one.
      Promise.all([
        directionsService.route({
          ...baseRequest,
          provideRouteAlternatives: baseRequest.waypoints.length === 0,
        }),
        directionsService.route({ ...baseRequest, avoidTolls: true }),
      ])
        .then(([withAlts, tollFree]) => {
          if (cancelled) return;
          const { result, tollFreeKeys } = mergeDrivingResults(withAlts, tollFree);
          const routes = result.routes.map((r, i) => {
            const metrics = routeMetrics(r);
            return {
              index: i,
              distance: formatDistance(metrics.meters),
              duration: formatDuration(metrics.seconds),
              hasTolls: !tollFreeKeys.has(routeKey(r)),
            };
          });
          onRoutes?.(routes);
          applyResult(result);
        })
        .catch((error) => {
          if (cancelled) return;
          rendererRef.current?.setMap(null);
          onSummary?.({ distance: "—", duration: "—" });
          onError?.(error);
          onRoutes?.([]);
          onRouteDetails?.(null, identity);
          onWarnings?.([], identity);
          onCopyrights?.("", identity);
        });
    } else {
      directionsService
        .route(baseRequest)
        .then((result) => {
          if (cancelled) return;
          applyResult(result);
        })
        .catch((error) => {
          if (cancelled) return;
          rendererRef.current?.setMap(null);
          onSummary?.({ distance: "—", duration: "—" });
          onError?.(error);
          onRouteDetails?.(null, identity);
          onWarnings?.([], identity);
          onCopyrights?.("", identity);
          if (travelMode === "TRANSIT") onTransitLegs?.([]);
        });
    }

    return () => {
      cancelled = true;
      rendererRef.current?.setMap(null);
    };
  }, [map, stops, travelMode, routeIndex]);

  useEffect(() => {
    if (!map || !optimizationRequest) return;

    const requestedStops = optimizationRequest.stops;
    const requestedMode = optimizationRequest.mode;
    if (!Array.isArray(requestedStops) || requestedStops.length < 3 || requestedMode === "TRANSIT") return;

    const directionsService = new google.maps.DirectionsService();
    const baseRequest = directionsRequest(requestedStops, requestedMode);
    let cancelled = false;

    Promise.all([
      directionsService.route(baseRequest),
      directionsService.route({ ...baseRequest, optimizeWaypoints: true }),
    ])
      .then(([baselineResult, optimizedResult]) => {
        if (cancelled) return;
        const baselineRoute = baselineResult.routes?.[0];
        const optimizedRoute = optimizedResult.routes?.[0];
        if (!baselineRoute || !optimizedRoute) throw new Error("ZERO_RESULTS");
        onOptimizationResult?.({
          id: optimizationRequest.id,
          mode: requestedMode,
          tripFingerprint: optimizationRequest.tripFingerprint,
          waypointOrder: optimizedRoute.waypoint_order,
          baseline: routeMetrics(baselineRoute),
          optimized: routeMetrics(optimizedRoute),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        onOptimizationError?.({
          id: optimizationRequest.id,
          mode: requestedMode,
          tripFingerprint: optimizationRequest.tripFingerprint,
          error,
        });
      });

    return () => { cancelled = true; };
  }, [map, optimizationRequest]);

  return null;
}
