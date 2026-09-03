// Trip persistence — browser-local planning state scoped to the current guest
// or signed-in account. Only { id, name, lat, lng, isMe, source } is stored —
// never the embedded `vendor` object, since that's a point-in-time snapshot
// that would go stale; MapPage re-hydrates it by id once vendors have loaded.
const STORAGE_KEY = "truebites:trip";

// Fired after every save so same-tab listeners (e.g. the global trip FAB)
// can react — the native `storage` event only fires in *other* tabs.
const CHANGE_EVENT = "truebites:trip-changed";

function isValidStop(s) {
  return s && typeof s.id === "string" && typeof s.lat === "number" && typeof s.lng === "number";
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
    return { stops: parsed.stops, travelMode: parsed.travelMode ?? null };
  } catch {
    return null; // corrupt/unavailable storage — start fresh
  }
}

export function saveTrip(stops, travelMode, owner = "guest") {
  try {
    const stripped = stops.map(({ id, name, lat, lng, isMe, source }) => ({ id, name, lat, lng, isMe, source }));
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
