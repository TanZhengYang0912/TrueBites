export const MELAKA_BOUNDS = {
  minLat: 1.8,
  maxLat: 2.6,
  minLng: 101.8,
  maxLng: 102.8,
};

const text = (value) => String(value ?? "").trim();

export function formatPhotonAddress(feature) {
  const properties = feature?.properties || {};
  const street = [properties.housenumber, properties.street].map(text).filter(Boolean).join(" ");
  const parts = [
    properties.name,
    street,
    properties.neighbourhood,
    properties.suburb,
    properties.district,
    properties.county,
    properties.city,
    properties.state,
    properties.postcode,
    properties.country,
  ].map(text).filter(Boolean);

  return parts.filter((part, index) => parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index).join(", ");
}

export function photonSearchUrl(query, limit = 6) {
  const params = new URLSearchParams({
    q: text(query),
    limit: String(limit),
    lat: "2.1896",
    lon: "102.2501",
    bbox: `${MELAKA_BOUNDS.minLng},${MELAKA_BOUNDS.minLat},${MELAKA_BOUNDS.maxLng},${MELAKA_BOUNDS.maxLat}`,
  });
  return `https://photon.komoot.io/api/?${params}`;
}
