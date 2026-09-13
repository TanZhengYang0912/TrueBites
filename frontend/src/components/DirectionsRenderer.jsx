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
  const routes = [...(primaryResult?.routes || [])];
  const known = new Set(routes.map(routeKey));
  const tollFreeRoutes = tollFreeResult?.routes || [];
  const tollFreeKeys = new Set(tollFreeRoutes.map(routeKey));
  for (const route of tollFreeRoutes) {
    const key = routeKey(route);
    if (!known.has(key)) {
      routes.push(route);
      known.add(key);
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

function extractTransitLegs(route) {
  const legs = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      if (step.travel_mode === "TRANSIT" && step.transit) {
        const transit = step.transit;
        legs.push({
          kind: "transit",
          vehicle: transit.line.vehicle?.type || "BUS",
          lineName: transit.line.short_name || transit.line.name,
          lineColor: transit.line.color || "#40544A",
          textColor: transit.line.text_color || "#fff",
          departureStop: transit.departure_stop?.name,
          arrivalStop: transit.arrival_stop?.name,
          departureTime: transit.departure_time?.text,
          arrivalTime: transit.arrival_time?.text,
          numStops: transit.num_stops,
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
  const resultRef = useRef(null);
  const callbacksRef = useRef({});
  callbacksRef.current = {
    onSummary, onRoutes, onTransitLegs, onRouteDetails, onWarnings,
    onCopyrights, onOptimizationResult, onOptimizationError, onError,
  };

  function clearRoute(identity, error = null) {
    const {
      onSummary: publishSummary,
      onRoutes: publishRoutes,
      onTransitLegs: publishTransit,
      onRouteDetails: publishDetails,
      onWarnings: publishWarnings,
      onCopyrights: publishCopyrights,
      onError: publishError,
    } = callbacksRef.current;
    rendererRef.current?.setMap(null);
    resultRef.current = null;
    publishSummary?.(null);
    publishRoutes?.([]);
    publishTransit?.([]);
    publishDetails?.(null, identity);
    publishWarnings?.([], identity);
    publishCopyrights?.("", identity);
    publishError?.(error);
  }

  function publishRoute(result, index, mode, calculatedAt) {
    if (!result?.routes?.length) return;
    const safeIndex = Math.min(index, result.routes.length - 1);
    const route = result.routes[safeIndex];
    const metrics = routeMetrics(route);
    const { meters, seconds, legDistancesMeters, legDurationsSeconds } = metrics;
    const identity = {
      mode,
      routeIndex: safeIndex,
      tripFingerprint: tripFingerprint(stops, mode),
    };
    rendererRef.current?.setMap(map);
    rendererRef.current?.setDirections(result);
    rendererRef.current?.setRouteIndex(safeIndex);
    callbacksRef.current.onError?.(null);
    callbacksRef.current.onSummary?.({
      distance: formatDistance(meters),
      duration: formatDuration(seconds),
    });
    callbacksRef.current.onTransitLegs?.(mode === "TRANSIT" ? extractTransitLegs(route) : []);
    callbacksRef.current.onRouteDetails?.({
      meters, seconds, legDistancesMeters, legDurationsSeconds, calculatedAt, ...identity,
    }, identity);
    callbacksRef.current.onWarnings?.(route.warnings || [], identity);
    callbacksRef.current.onCopyrights?.(route.copyrights || "", identity);
  }

  useEffect(() => {
    if (!map) return;
    if (!rendererRef.current) {
      rendererRef.current = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        preserveViewport: true,
      });
    }

    const identity = {
      mode: travelMode,
      routeIndex,
      tripFingerprint: tripFingerprint(stops || [], travelMode),
    };
    if (!stops || stops.length < 2 || !travelMode) {
      clearRoute(identity);
      return;
    }

    clearRoute(identity);
    const directionsService = new google.maps.DirectionsService();
    const baseRequest = directionsRequest(stops, travelMode);
    const calculatedAt = Date.now();
    let cancelled = false;

    if (travelMode === "DRIVING") {
      Promise.all([
        directionsService.route({
          ...baseRequest,
          provideRouteAlternatives: baseRequest.waypoints.length === 0,
        }),
        directionsService.route({ ...baseRequest, avoidTolls: true }),
      ])
        .then(([primary, tollFree]) => {
          if (cancelled) return;
          const merged = mergeDrivingResults(primary, tollFree);
          const routes = merged.result.routes.map((route, index) => {
            const metrics = routeMetrics(route);
            return {
              index,
              distance: formatDistance(metrics.meters),
              duration: formatDuration(metrics.seconds),
              hasTolls: !merged.tollFreeKeys.has(routeKey(route)),
            };
          });
          resultRef.current = { result: merged.result, mode: travelMode, calculatedAt };
          callbacksRef.current.onRoutes?.(routes);
          publishRoute(merged.result, routeIndex, travelMode, calculatedAt);
        })
        .catch((error) => {
          if (!cancelled) clearRoute(identity, error);
        });
    } else {
      directionsService.route(baseRequest)
        .then((result) => {
          if (cancelled) return;
          resultRef.current = { result, mode: travelMode, calculatedAt };
          callbacksRef.current.onRoutes?.([]);
          publishRoute(result, routeIndex, travelMode, calculatedAt);
        })
        .catch((error) => {
          if (!cancelled) clearRoute(identity, error);
        });
    }

    return () => {
      cancelled = true;
      rendererRef.current?.setMap(null);
    };
  }, [map, stops, travelMode]);

  useEffect(() => {
    const cached = resultRef.current;
    if (!cached) return;
    publishRoute(cached.result, routeIndex, cached.mode, cached.calculatedAt);
  }, [routeIndex, travelMode]);

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
        callbacksRef.current.onOptimizationResult?.({
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
        callbacksRef.current.onOptimizationError?.({
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
