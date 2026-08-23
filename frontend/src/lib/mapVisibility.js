// Which vendor pins the map draws, and the distance maths behind it.
// Pure — no React, no google.maps — so the rule can be tested directly.

const EARTH_RADIUS_KM = 6371;

// Great-circle distance. Accurate enough at city scale and dependency-free.
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// "Show vendors" is the normal map mode: every mapped vendor is visible, with
// Google Maps clustering the dense areas. The nearby radius belongs to the
// add-to-trip list, not to the discoverability of pins. Turning vendor pins off
// still leaves trip stops visible.
export function selectVisibleVendors({ vendors, showAll, stopIds, focusVendor }) {
  const visible = vendors.filter((v) => {
    if (v.latitude == null || v.longitude == null) return false;
    return showAll || stopIds.has(v.id);
  });
  if (focusVendor && focusVendor.latitude != null && focusVendor.longitude != null && !visible.some((v) => v.id === focusVendor.id)) visible.push(focusVendor);
  return visible;
}
