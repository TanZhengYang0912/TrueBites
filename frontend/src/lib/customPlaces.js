const GOOGLE_PLACE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

const FOOD_PLACE_TYPES = new Set([
  "restaurant", "cafe", "bakery", "bar", "meal_takeaway",
  "meal_delivery", "food_court", "dessert_shop", "coffee_shop", "ice_cream_shop",
]);

export function createLatestSelectionGate() {
  let sequence = 0;
  return {
    next: () => ++sequence,
    isCurrent: (selectionId) => selectionId === sequence,
  };
}

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function sanitizeGoogleAttributions(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const provider = cleanText(entry?.provider);
      const providerURI = cleanText(entry?.providerURI);
      if (!provider) return null;
      return { provider, ...(providerURI && /^https?:\/\//i.test(providerURI) ? { providerURI } : {}) };
    })
    .filter(Boolean);
}

function moneyAmount(money) {
  if (!money) return null;
  const units = Number(money.units ?? 0);
  const nanos = Number(money.nanos ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  return units + (nanos / 1_000_000_000);
}

function formatMoney(money) {
  const amount = moneyAmount(money);
  const currency = cleanText(money?.currencyCode);
  if (amount == null || !currency) return null;
  const digits = Number.isInteger(amount) ? 0 : 2;
  if (currency === "MYR") {
    return `RM${amount.toLocaleString("en-MY", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
  }
  return new Intl.NumberFormat("en-MY", {
    style: "currency", currency, currencyDisplay: "symbol",
    maximumFractionDigits: digits, minimumFractionDigits: digits,
  }).format(amount);
}

export function formatGooglePriceRange(primaryType, priceRange) {
  if (!FOOD_PLACE_TYPES.has(cleanText(primaryType))) return null;
  const start = formatMoney(priceRange?.startPrice);
  if (!start) return null;
  const end = formatMoney(priceRange?.endPrice);
  return !end || end === start ? start : `${start} – ${end}`;
}

function coordinateValue(location, key) {
  const value = typeof location?.[key] === "function" ? location[key]() : location?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeDetails(placeId, place) {
  const label = cleanText(place.displayName?.text || place.displayName);
  const address = cleanText(place.formattedAddress);
  const primaryType = cleanText(place.primaryType);
  const lat = coordinateValue(place.location, "lat");
  const lng = coordinateValue(place.location, "lng");
  const priceLabel = formatGooglePriceRange(primaryType, place.priceRange);
  const attributions = sanitizeGoogleAttributions(place.attributions);
  return {
    placeId,
    ...(label ? { label } : {}),
    ...(address ? { address } : {}),
    ...(lat != null && lng != null ? { lat, lng } : {}),
    ...(primaryType ? { primaryType } : {}),
    ...(priceLabel ? { priceLabel } : {}),
    ...(attributions.length ? { attributions } : {}),
  };
}

function fetchLegacyPlaceDetails(placesLib, placeId) {
  if (!placesLib?.PlacesService) throw new TypeError("Google Place details are unavailable.");
  const host = typeof document === "undefined"
    ? null
    : document.getElementById("google-place-attributions") || document.createElement("div");
  const service = new placesLib.PlacesService(host);
  return new Promise((resolve, reject) => {
    service.getDetails({
      placeId,
      fields: ["name", "formatted_address", "geometry", "types"],
    }, (place, status) => {
      const ok = placesLib.PlacesServiceStatus?.OK || "OK";
      if (status !== ok || !place) {
        reject(new Error(`Google Place Details failed: ${status || "UNKNOWN"}`));
        return;
      }
      resolve(normalizeDetails(placeId, {
        displayName: place.name,
        formattedAddress: place.formatted_address,
        location: place.geometry?.location,
        primaryType: place.types?.[0],
      }));
    });
  });
}

export async function fetchGooglePlaceDetails(placesLib, placeId) {
  const cleanPlaceId = cleanText(placeId);
  if (!cleanPlaceId) throw new TypeError("Google Place details require a Place ID.");
  try {
    if (!placesLib?.Place) throw new TypeError("Google Place API is unavailable.");
    const place = new placesLib.Place({ id: cleanPlaceId });
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "primaryType"] });
    const primaryType = cleanText(place.primaryType);
    if (FOOD_PLACE_TYPES.has(primaryType)) {
      try {
        await place.fetchFields({ fields: ["priceRange"] });
      } catch {
        // Optional price access must not discard the already loaded basic details.
      }
    }
    return normalizeDetails(cleanPlaceId, place);
  } catch (error) {
    if (!placesLib?.PlacesService) throw error;
    return fetchLegacyPlaceDetails(placesLib, cleanPlaceId);
  }
}

export function customStopFromPlace(id, place, cachedAt = Date.now()) {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new TypeError("Custom place requires valid coordinates.");
  }
  const name = cleanText(place?.label) || cleanText(place?.address);
  if (!name) throw new TypeError("Custom place requires a name.");
  const stop = {
    id,
    type: "custom",
    name,
    lat,
    lng,
    cachedAt: Number.isFinite(Number(cachedAt)) ? Number(cachedAt) : Date.now(),
  };
  for (const key of ["placeId", "address", "primaryType", "priceLabel"]) {
    const value = cleanText(place?.[key]);
    if (value) stop[key] = value;
  }
  const attributions = sanitizeGoogleAttributions(place?.attributions);
  if (attributions.length) stop.attributions = attributions;
  return stop;
}

export function isFreshGooglePlaceCache(stop, now = Date.now()) {
  if (stop?.type !== "custom") return true;
  if (!cleanText(stop?.placeId)) return false;
  const cachedAt = Number(stop?.cachedAt);
  if (!Number.isFinite(cachedAt)) return true;
  return Number(now) - cachedAt <= GOOGLE_PLACE_CACHE_MS;
}
