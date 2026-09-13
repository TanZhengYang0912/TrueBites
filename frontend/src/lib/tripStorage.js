import { isTripAtLimit } from "./tripRoutingPolicy.js";
import { isFreshGooglePlaceCache } from "./customPlaces.js";

// Trip persistence — browser-local planning state scoped to the current guest
// or signed-in account. Only non-location stops are durable; the precise
// `isMe` origin belongs to tab-scoped sessionStorage. The embedded `vendor`
// object is also omitted because it is a point-in-time snapshot that would go
// stale; MapPage re-hydrates vendors by id once the latest list has loaded.
const STORAGE_KEY = "truebites:trip";

// Fired after every save so same-tab listeners (e.g. the global trip FAB)
// can react — the native `storage` event only fires in *other* tabs.
const CHANGE_EVENT = "truebites:trip-changed";

function isValidStop(s) {
  return s && typeof s.id === "string" && typeof s.lat === "number" && typeof s.lng === "number";
}

function persistentStops(stops, now = Date.now()) {
  return stops
    .filter((stop) => !stop.isMe && (stop.source !== "custom" || stop.placeId))
    .map(({ id, name, lat, lng, source, placeId, cachedAt }) => {
      if (source === "custom") {
        return {
          id,
          lat,
          lng,
          isMe: false,
          source: "custom",
          placeId,
          cachedAt: Number.isFinite(Number(cachedAt)) ? Number(cachedAt) : now,
        };
      }
      return { id, name, lat, lng, isMe: false, source };
    });
}

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
    if (!Array.isArray(parsed?.stops) || !parsed.stops.every(isValidStop)) return null;
    const now = Date.now();
    const normalizedStops = persistentStops(parsed.stops, now);
    const stops = normalizedStops.filter((stop) => isFreshGooglePlaceCache(stop, now));
    if (JSON.stringify(stops) !== JSON.stringify(parsed.stops)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        owner,
        stops,
        travelMode: parsed.travelMode ?? null,
      }));
    }
    return { stops, travelMode: parsed.travelMode ?? null };
  } catch {
    return null; // corrupt/unavailable storage — start fresh
  }
}

export function saveTrip(stops, travelMode, owner = "guest") {
  try {
    const stripped = persistentStops(stops);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, stops: stripped, travelMode }));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // storage full/unavailable — trip just won't persist this change
  }
}

export function clearTrip() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Unavailable storage is already equivalent to having no persisted trip.
  }
}

// Supabase can emit repeated SIGNED_IN/session-refresh events for the same
// account. Track the actual identity instead of event names so reloads and
// token refreshes keep the trip, while guest/login/logout/account switches
// clear it exactly once per boundary.
export function createTripSessionBoundary(onIdentityChange) {
  let currentOwner;
  return (session) => {
    const nextOwner = tripOwner(session);
    if (currentOwner === undefined) {
      currentOwner = nextOwner;
      return false;
    }
    if (currentOwner === nextOwner) return false;
    currentOwner = nextOwner;
    onIdentityChange?.();
    return true;
  };
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

// Same idea as subscribeTripCount, but reports the set of vendor ids
// currently in the trip — for pages outside the map (Saved, My reviews) that
// need to show a vendor's card as already-added without duplicating MapPage's
// route-planning logic.
export function subscribeTripStopIds(callback, owner = "guest") {
  const read = () => callback(new Set((loadTrip(owner)?.stops || []).map((s) => s.id)));
  read();
  window.addEventListener(CHANGE_EVENT, read);
  window.addEventListener("storage", read);
  return () => {
    window.removeEventListener(CHANGE_EVENT, read);
    window.removeEventListener("storage", read);
  };
}

// Appends a vendor to the trip from pages that only show a vendor card (no
// map/route context) — Saved and My reviews. Mirrors MapPage's own addStop
// mapping ({ id, name, lat, lng, isMe: false }) minus route re-planning,
// since there's no route panel to update on those pages.
export function addVendorToTrip(vendor, owner = "guest") {
  if (vendor.latitude == null || vendor.longitude == null) return "no-location";
  const stored = loadTrip(owner);
  const stops = stored?.stops || [];
  if (stops.some((s) => s.id === vendor.id)) return "duplicate";
  if (isTripAtLimit(stops.length)) return "limit";
  const stop = { id: vendor.id, name: vendor.name, lat: vendor.latitude, lng: vendor.longitude, isMe: false };
  saveTrip([...stops, stop], stored?.travelMode ?? null, owner);
  return "added";
}
