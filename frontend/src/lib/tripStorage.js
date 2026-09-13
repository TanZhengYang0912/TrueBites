// Trip persistence — browser-local planning state scoped to the current guest
// or signed-in account. Only id/type/vendorId/name/lat/lng is stored — never
// the embedded `vendor` object, since that's a point-in-time snapshot that
// would go stale; MapPage re-hydrates it by vendorId once vendors have loaded.
import { isResolvedStop, migrateStop } from "./tripStops.js";

const STORAGE_KEY = "truebites:trip";

// Fired after every save so same-tab listeners (e.g. the global trip FAB)
// can react — the native `storage` event only fires in *other* tabs.
const CHANGE_EVENT = "truebites:trip-changed";

export function tripOwner(session) {
  return session?.user?.id ? `user:${session.user.id}` : "guest";
}

export function loadTrip(owner = "guest") {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Ownerless data predates account isolation and cannot safely be assigned
    // to whichever person happens to open this browser next.
    if (parsed?.owner !== owner) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const stops = Array.isArray(parsed?.stops) ? parsed.stops.map(migrateStop) : null;
    if (!stops || !stops.every((stop) => isResolvedStop(stop) && typeof stop.id === "string")) return null;
    if (stops.filter((stop) => stop.type === "anchor").length > 1) return null;
    return { stops, travelMode: parsed.travelMode || "DRIVING" };
  } catch {
    return null; // corrupt/unavailable storage — start fresh
  }
}

export function saveTrip(stops, travelMode, owner = "guest") {
  try {
    const stripped = stops.map(({ id, type, vendorId, name, lat, lng }) => ({ id, type, vendorId, name, lat, lng }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, stops: stripped, travelMode }));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // storage full/unavailable — trip just won't persist this change
  }
}

// Supabase can emit repeated SIGNED_IN/session-refresh events for the same
// account, and the trip is browser-local, not server-synced. Reconcile
// against the actual identity behind each event so a guest trip is handed to
// the first account that signs in, a reload or token refresh for the same
// account keeps it, and a logout or account switch clears the previous
// owner's trip instead of leaking it forward.
export function reconcileTripOwner(session) {
  const nextOwner = tripOwner(session);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return "empty";
    const parsed = JSON.parse(raw);
    if (parsed?.owner === nextOwner) return "kept";
    if (parsed?.owner === "guest" && nextOwner !== "guest") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, owner: nextOwner }));
      return "adopted";
    }
    window.localStorage.removeItem(STORAGE_KEY);
    return "cleared";
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* unavailable */ }
    return "cleared";
  }
}

// Reactive stop count for UI that lives outside MapPage (e.g. a global FAB).
// Listens for the same-tab CHANGE_EVENT plus the native cross-tab `storage`
// event so it stays in sync however the trip was last edited.
export function subscribeTripCount(callback, owner = "guest") {
  const read = () => callback(loadTrip(owner)?.stops.length ?? 0);
  read();
  window.addEventListener(CHANGE_EVENT, read);
  window.addEventListener("storage", read);
  return () => {
    window.removeEventListener(CHANGE_EVENT, read);
    window.removeEventListener("storage", read);
  };
}
