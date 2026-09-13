export const STOP_TYPES = ["anchor", "vendor", "custom"];

let idCounter = 0;
export function newStopId(prefix = "stop") {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

export function isResolvedStop(stop) {
  if (!STOP_TYPES.includes(stop?.type)) return false;
  if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return false;
  return stop.type !== "vendor" || typeof stop.vendorId === "string";
}

export function newDraft(type = "custom") {
  if (type !== "anchor" && type !== "custom") throw new TypeError("draft type must be anchor or custom");
  return { id: newStopId("draft"), type };
}

export function rowsFor(trip = [], draftStops = []) {
  const ordered = [
    ...draftStops.filter((draft) => draft.type === "anchor").map((draft) => ({ ...draft, draft: true })),
    ...trip.map((stop) => ({ ...stop, draft: false })),
    ...draftStops.filter((draft) => draft.type === "custom").map((draft) => ({ ...draft, draft: true })),
  ];
  return ordered.map((row, index) => ({ ...row, number: index + 1 }));
}

const EARTH_M = 6371000;
function metresBetween(a, b) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearlySamePlace(a, b, metres = 15) {
  return metresBetween(a, b) <= metres;
}

export function groupStopsByPosition(numberedStops = [], metres = 15) {
  const stable = [...numberedStops].sort((a, b) => a.lat - b.lat || a.lng - b.lng || String(a.id).localeCompare(String(b.id)));
  const groups = [];
  stable.forEach((stop, index) => {
    const entry = { id: stop.id, name: stop.name, number: stop.number ?? index + 1 };
    const group = groups.find((candidate) => nearlySamePlace(candidate, stop, metres));
    if (group) group.stops.push(entry);
    else groups.push({ lat: stop.lat, lng: stop.lng, stops: [entry] });
  });
  groups.forEach((group) => group.stops.sort((a, b) => a.number - b.number));
  groups.sort((a, b) => a.stops[0].number - b.stops[0].number);
  return groups;
}

export function migrateStop(stop) {
  if (STOP_TYPES.includes(stop?.type)) {
    return stop.type === "vendor" && !stop.vendorId ? { ...stop, vendorId: stop.id } : stop;
  }
  const { isMe, source, ...rest } = stop || {};
  if (isMe) return { ...rest, type: "anchor" };
  if (source === "custom" || source === "gps" || String(rest.id).startsWith("custom-")) {
    return { ...rest, type: "custom" };
  }
  return { ...rest, type: "vendor", vendorId: rest.vendorId || rest.id };
}
