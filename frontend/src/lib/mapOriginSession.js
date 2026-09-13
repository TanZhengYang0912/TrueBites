const STORAGE_KEY = "truebites:map-origin";
const CLEAR_EVENT = "truebites:map-origin-cleared";

function validOrigin(value) {
  return Boolean(
    value
    && typeof value.lat === "number" && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90
    && typeof value.lng === "number" && Number.isFinite(value.lng) && value.lng >= -180 && value.lng <= 180,
  );
}

export function loadMapOrigin() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY));
    return validOrigin(parsed) ? { lat: parsed.lat, lng: parsed.lng } : null;
  } catch {
    return null;
  }
}

export function saveMapOrigin(origin) {
  try {
    if (!validOrigin(origin)) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ lat: origin.lat, lng: origin.lng }));
  } catch {
    // Location remains available for the current mount when storage is unavailable.
  }
}

export function clearMapOrigin() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CLEAR_EVENT));
  } catch {
    // Unavailable session storage is already equivalent to no saved origin.
  }
}

export function subscribeMapOriginClear(callback) {
  window.addEventListener(CLEAR_EVENT, callback);
  return () => window.removeEventListener(CLEAR_EVENT, callback);
}

function sessionIdentity(session) {
  return session?.user?.id ? `user:${session.user.id}` : "guest";
}

export function createMapOriginSessionBoundary(onSensitiveIdentityChange) {
  let currentIdentity;
  return (session) => {
    const nextIdentity = sessionIdentity(session);
    if (currentIdentity === undefined) {
      currentIdentity = nextIdentity;
      return false;
    }
    if (currentIdentity === nextIdentity) return false;
    const preserveGuestLogin = currentIdentity === "guest" && nextIdentity !== "guest";
    currentIdentity = nextIdentity;
    if (preserveGuestLogin) return false;
    onSensitiveIdentityChange?.();
    return true;
  };
}
