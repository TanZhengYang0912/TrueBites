// Free (registration-only, no billing) street-level imagery — the preferred
// source for storefront/exterior Cover candidates per the project's explicit
// "no paid Google Places dependency" direction. Requires MAPILLARY_ACCESS_TOKEN
// (free developer token from mapillary.com, no credit card).
//
// Mapillary images carry NO place name or category — only GPS coordinates —
// so unlike the TikTok/Flickr providers this can't use name-similarity at
// all. Confidence here is distance-only, over a much tighter radius than
// photoMatching.js's general 500m decay (Melaka's old-town shoplots sit only
// metres apart, and there's no name to narrow things down). The confidence
// badge can cross AUTO_SUGGEST_THRESHOLD for a genuinely on-top-of-the-
// coordinates match — tested against the real API and found that capping it
// below that threshold (as originally designed) made the *lower* threshold,
// NEEDS_CONFIRMATION_THRESHOLD, nearly unreachable even for an 8m-away photo,
// so almost nothing ever surfaced to the admin at all. That's fine safety-
// wise either way: crossing AUTO_SUGGEST_THRESHOLD only changes a cosmetic
// UI badge (see PhotoDiscoveryPanel.jsx) — an admin still has to click
// "Set as Cover"/"Add to Gallery" for every candidate regardless of badge
// colour, so a "high confidence" Mapillary photo is not published any more
// automatically than a "needs confirmation" one.
import { haversine } from "../../haversine.js";

const MAPILLARY_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;
// Mapillary's Graph API hard-caps this parameter at 50 — a higher value
// makes every request fail with HTTP 500 ("radius must be a number less
// than or equal to 50"). Found by testing against the real API: the
// generic `if (!res.ok) return []` fail-quiet handling below meant this
// silently produced zero candidates for every vendor until logging was
// added and the response was inspected directly.
const SEARCH_RADIUS_METERS = 50;
const MAX_CANDIDATES = 3;
// Calibrated so a genuinely close match (~15m, well within normal GPS/
// building-footprint slack) crosses NEEDS_CONFIRMATION_THRESHOLD (60) and so
// only an almost-exact match (~7m or closer) crosses AUTO_SUGGEST_THRESHOLD
// (85) — see the module comment above for why crossing that upper one is fine.
const MAX_CONFIDENCE = 90;

// Linear decay to 0 at SEARCH_RADIUS_METERS, scaled to MAX_CONFIDENCE — a
// photo captured right on top of the vendor's coordinates scores MAX_CONFIDENCE,
// never 100, since there's no name/category to actually confirm identity.
export function mapillaryConfidence(distanceMeters) {
  if (distanceMeters == null || Number.isNaN(distanceMeters)) return 0;
  return Math.round(Math.max(0, 1 - distanceMeters / SEARCH_RADIUS_METERS) * MAX_CONFIDENCE);
}

export async function findMapillaryCandidates(vendor) {
  if (!MAPILLARY_TOKEN) return [];
  if (vendor.latitude == null || vendor.longitude == null) return [];

  const params = new URLSearchParams({
    access_token: MAPILLARY_TOKEN,
    fields: "id,thumb_1024_url,geometry",
    // Mapillary's Graph API requires separate lat/lng (not the combined
    // `closeto` param) whenever `radius` is also given — confirmed directly
    // against the live API; `closeto` + `radius` together 500s.
    lat: String(vendor.latitude),
    lng: String(vendor.longitude),
    radius: String(SEARCH_RADIUS_METERS),
    limit: String(MAX_CANDIDATES * 2),
  });

  let payload;
  try {
    const res = await fetch(`https://graph.mapillary.com/images?${params}`);
    if (!res.ok) {
      // Never crash discovery over this — but do log it, so a bad/expired
      // token or a request-shape bug (like the radius cap above) shows up
      // somewhere instead of silently looking like "no imagery nearby".
      console.error(`Mapillary request failed (HTTP ${res.status}) for vendor ${vendor.id}:`, await res.text().catch(() => ""));
      return [];
    }
    payload = await res.json();
  } catch (err) {
    console.error(`Mapillary request errored for vendor ${vendor.id}:`, err.message);
    return [];
  }

  const data = Array.isArray(payload?.data) ? payload.data : [];
  if (!data.length) return [];

  return data
    .map((img) => {
      const [lng, lat] = img.geometry?.coordinates || [];
      if (lat == null || lng == null || !img.thumb_1024_url) return null;
      const distanceMeters = Math.round(haversine(vendor.latitude, vendor.longitude, lat, lng) * 1000);
      const confidence = mapillaryConfidence(distanceMeters);
      return {
        provider: "mapillary",
        placeName: vendor.vendor_name,
        category: "exterior",
        confidence,
        breakdown: {
          matchedPlaceName: null, // Mapillary has no place-name field to confirm identity against
          distanceMeters,
          nameSimilarityPct: null,
          category: "exterior",
          categoryMatch: null,
          note: `Street-level photo captured ${distanceMeters}m from this vendor's coordinates — Mapillary has no way to confirm it's this specific storefront, so please verify before confirming`,
        },
        previewUrl: img.thumb_1024_url,
        photoRef: img.thumb_1024_url,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}
