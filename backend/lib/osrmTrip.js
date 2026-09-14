function tripFailure() {
  return new Error("trip failed");
}

function validCoordinate(value) {
  return value !== null
    && value !== undefined
    && (typeof value !== "string" || value.trim() !== "")
    && Number.isFinite(Number(value));
}

function validPoint(point) {
  return validCoordinate(point?.lat) && validCoordinate(point?.lng);
}

function validPermutation(order, count) {
  return Array.isArray(order)
    && order.length === count
    && order.every((index) => Number.isInteger(index) && index >= 0 && index < count)
    && new Set(order).size === count;
}

export function buildOsrmTripUrl(points, optimize = true) {
  if (!Array.isArray(points) || points.length < 2 || !points.every(validPoint)) throw tripFailure();
  const coords = points.map((point) => `${Number(point.lng)},${Number(point.lat)}`).join(";");
  const service = optimize ? "trip" : "route";
  const url = new URL(`https://router.project-osrm.org/${service}/v1/driving/${coords}`);
  if (optimize) {
    url.searchParams.set("source", "first");
    url.searchParams.set("destination", "last");
    url.searchParams.set("roundtrip", "false");
  }
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  return url;
}

export function parseOsrmTripResponse(data, pointCount, optimize = true) {
  if (data?.code !== "Ok") throw tripFailure();
  const route = optimize ? data.trips?.[0] : data.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!route || !Array.isArray(coordinates) || coordinates.length === 0
      || !coordinates.every((coordinate) => Array.isArray(coordinate)
        && coordinate.length >= 2
        && Number.isFinite(Number(coordinate[0]))
        && Number.isFinite(Number(coordinate[1])))
      || !Number.isFinite(Number(route.distance)) || Number(route.distance) < 0
      || !Number.isFinite(Number(route.duration)) || Number(route.duration) < 0) {
    throw tripFailure();
  }

  let order = Array.from({ length: pointCount }, (_, index) => index);
  if (optimize) {
    if (!Array.isArray(data.waypoints) || data.waypoints.length !== pointCount) throw tripFailure();
    order = Array(pointCount).fill(null);
    data.waypoints.forEach((waypoint, inputIndex) => {
      const routeIndex = waypoint?.waypoint_index;
      if (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= pointCount) throw tripFailure();
      order[routeIndex] = inputIndex;
    });
    if (!validPermutation(order, pointCount) || order[0] !== 0 || order.at(-1) !== pointCount - 1) {
      throw tripFailure();
    }
  }

  return {
    order,
    path: coordinates.map(([lng, lat]) => ({ lat, lng })),
    distance: `${(Number(route.distance) / 1000).toFixed(1)} km`,
    duration: `${Math.round(Number(route.duration) / 60)} mins`,
  };
}

export async function fetchOsrmTrip(points, optimize = true, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(buildOsrmTripUrl(points, optimize));
  if (response?.ok === false) throw tripFailure();
  return parseOsrmTripResponse(await response.json(), points.length, optimize);
}
