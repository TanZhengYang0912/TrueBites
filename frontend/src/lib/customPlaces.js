const GOOGLE_PLACE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

const FOOD_PLACE_TYPES = new Set([
  "restaurant",
  "cafe",
  "bakery",
  "bar",
  "meal_takeaway",
  "meal_delivery",
  "food_court",
  "dessert_shop",
  "coffee_shop",
  "ice_cream_shop",
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

  const maximumFractionDigits = Number.isInteger(amount) ? 0 : 2;
  if (currency === "MYR") {
    return `RM${amount.toLocaleString("en-MY", { maximumFractionDigits, minimumFractionDigits: maximumFractionDigits })}`;
  }

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
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

function normalizedPlaceDetails(placeId, {
  displayName,
  formattedAddress,
  location,
  primaryType,
  priceRange,
  attributions,
}) {
  const label = cleanText(displayName?.text || displayName);
  const address = cleanText(formattedAddress);
  const cleanPrimaryType = cleanText(primaryType);
  const lat = coordinateValue(location, "lat");
  const lng = coordinateValue(location, "lng");
  const priceLabel = formatGooglePriceRange(cleanPrimaryType, priceRange);
  const safeAttributions = (Array.isArray(attributions) ? attributions : [])
    .map((attribution) => {
      const provider = cleanText(attribution?.provider);
      const providerURI = cleanText(attribution?.providerURI);
      if (!provider) return null;
      return {
        provider,
        ...(providerURI && /^https?:\/\//i.test(providerURI) ? { providerURI } : {}),
      };
    })
    .filter(Boolean);
  return {
    placeId,
    ...(label ? { label } : {}),
    ...(address ? { address } : {}),
    ...(lat != null && lng != null ? { lat, lng } : {}),
    ...(cleanPrimaryType ? { primaryType: cleanPrimaryType } : {}),
    ...(priceLabel ? { priceLabel } : {}),
    ...(safeAttributions.length ? { attributions: safeAttributions } : {}),
  };
}

function normalizeLegacyAttributions(htmlAttributions) {
  return (Array.isArray(htmlAttributions) ? htmlAttributions : [])
    .map((html) => {
      if (typeof html !== "string") return null;
      const href = html.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      const provider = html
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
      if (!provider) return null;
      return {
        provider,
        ...(href && /^https?:\/\//i.test(href) ? { providerURI: href } : {}),
      };
    })
    .filter(Boolean);
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
      resolve(normalizedPlaceDetails(placeId, {
        displayName: place.name,
        formattedAddress: place.formatted_address,
        location: place.geometry?.location,
        primaryType: place.types?.[0],
        attributions: normalizeLegacyAttributions(place.html_attributions),
      }));
    });
  });
}

export async function fetchGooglePlaceDetails(placesLib, placeId) {
  const cleanPlaceId = cleanText(placeId);
  if (!cleanPlaceId) throw new TypeError("Google Place details require a Place ID.");

  try {
    if (!placesLib?.Place) throw new TypeError("Google Place API is unavailable.");
    const detailPlace = new placesLib.Place({ id: cleanPlaceId });
    await detailPlace.fetchFields({
      fields: ["displayName", "formattedAddress", "location", "primaryType"],
    });

    const primaryType = cleanText(detailPlace.primaryType);
    if (FOOD_PLACE_TYPES.has(primaryType)) {
      try {
        await detailPlace.fetchFields({ fields: ["priceRange"] });
      } catch {
        // A missing Enterprise price entitlement must not discard the basic
        // Place details that already loaded successfully.
      }
    }
    return normalizedPlaceDetails(cleanPlaceId, {
      displayName: detailPlace.displayName,
      formattedAddress: detailPlace.formattedAddress,
      location: detailPlace.location,
      primaryType,
      priceRange: detailPlace.priceRange,
      attributions: detailPlace.attributions,
    });
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
    name,
    lat,
    lng,
    isMe: false,
    source: "custom",
    cachedAt: Number.isFinite(Number(cachedAt)) ? Number(cachedAt) : Date.now(),
  };
  const placeId = cleanText(place?.placeId);
  const address = cleanText(place?.address);
  const primaryType = cleanText(place?.primaryType);
  const priceLabel = cleanText(place?.priceLabel);
  const attributions = Array.isArray(place?.attributions) ? place.attributions : [];
  if (placeId) stop.placeId = placeId;
  if (address) stop.address = address;
  if (primaryType) stop.primaryType = primaryType;
  if (priceLabel) stop.priceLabel = priceLabel;
  if (attributions.length) stop.attributions = attributions;
  return stop;
}

export function isFreshGooglePlaceCache(stop, now = Date.now()) {
  if (stop?.source !== "custom") return true;
  if (!cleanText(stop?.placeId)) return false;
  const cachedAt = Number(stop?.cachedAt);
  if (!Number.isFinite(cachedAt)) return true;
  return Number(now) - cachedAt <= GOOGLE_PLACE_CACHE_MS;
}

export function customStopsForMap(trip) {
  return (Array.isArray(trip) ? trip : [])
    .map((stop, index) => ({ ...stop, stopNum: index + 1 }))
    .filter((stop) => stop.source === "custom" && Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}
