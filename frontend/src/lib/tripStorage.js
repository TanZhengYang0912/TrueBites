// Trip persistence — unauthenticated, browser-local planning state (mirrors
// the multi-stop-map handoff's TripProvider). Only { id, name, lat, lng, isMe,
// source } is stored — never the embedded `vendor` object, since that's a
// point-in-time snapshot that would go stale; MapPage re-hydrates it by id
// once the vendor list has loaded.
const STORAGE_KEY = "truebites:trip";

// Fired after every save so same-tab listeners (e.g. the global trip FAB)
// can react — the native `storage` event only fires in *other* tabs.
const CHANGE_EVENT = "truebites:trip-changed";

function isValidStop(s) {
  return s && typeof s.id === "string" && typeof s.lat === "number" && typeof s.lng === "number";
}

export function loadTrip() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.stops) || !parsed.stops.every(isValidStop)) return null;
    return { stops: parsed.stops, travelMode: parsed.travelMode ?? null };
  } catch {
    return null; // corrupt/unavailable storage — start fresh
  }
}

export function saveTrip(stops, travelMode) {
  try {
    const stripped = stops.map(({ id, name, lat, lng, isMe, source }) => ({ id, name, lat, lng, isMe, source }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ stops: stripped, travelMode }));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // storage full/unavailable — trip just won't persist this change
  }
}

// Reactive stop count for UI that lives outside MapPage (e.g. a global FAB).
// Listens for the same-tab CHANGE_EVENT plus the native cross-tab `storage`
// event so it stays in sync however the trip was last edited.
export function subscribeTripCount(callback) {
  const read = () => callback(loadTrip()?.stops.length ?? 0);
  read();
  window.addEventListener(CHANGE_EVENT, read);
  window.addEventListener("storage", read);
  return () => {
    window.removeEventListener(CHANGE_EVENT, read);
    window.removeEventListener("storage", read);
  };
}
