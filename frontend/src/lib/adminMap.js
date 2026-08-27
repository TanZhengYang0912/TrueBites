// The admin map deliberately stays focused on the same Melaka operating area
// as the customer map. Bad imported coordinates must not pull the camera out
// to another country when the admin is viewing all vendor records.
export const MELAKA_CENTER = { lat: 2.1896, lng: 102.2501 };

export const MELAKA_BOUNDS = {
  minLat: 1.8,
  maxLat: 2.6,
  minLng: 101.8,
  maxLng: 102.8,
};

export function coordinatesFor(vendor) {
  const missing = (value) => value == null || (typeof value === "string" && value.trim() === "");
  if (missing(vendor?.latitude) || missing(vendor?.longitude)) return null;
  const lat = Number(vendor?.latitude);
  const lng = Number(vendor?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function isMelakaCoordinate(position) {
  return Boolean(
    position &&
      position.lat >= MELAKA_BOUNDS.minLat &&
      position.lat <= MELAKA_BOUNDS.maxLat &&
      position.lng >= MELAKA_BOUNDS.minLng &&
      position.lng <= MELAKA_BOUNDS.maxLng
  );
}

export function filterAdminMapVendors(vendors = []) {
  const mapped = [];
  const excluded = { outsideMelaka: 0, missingCoordinates: 0 };

  vendors.forEach((vendor) => {
    const position = coordinatesFor(vendor);
    if (!position) {
      excluded.missingCoordinates += 1;
    } else if (!isMelakaCoordinate(position)) {
      excluded.outsideMelaka += 1;
    } else {
      mapped.push({ vendor, position });
    }
  });

  return { mapped, excluded };
}
