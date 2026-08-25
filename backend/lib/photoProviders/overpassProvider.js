// Free, keyless, no-registration source — OpenStreetMap's Overpass API
// (https://overpass-api.de/api/interpreter) needs no account/token at all,
// unlike Mapillary (needs a free access token) or the paid Google Places API
// this project deliberately avoids. Queries every node/way within
// SEARCH_RADIUS_METERS of the vendor's coordinates that carries an `image`
// or `wikimedia_commons` tag — OSM contributors sometimes attach a photo to
// a shop/restaurant node directly.
//
// Unlike Mapillary (coordinates only, no name), OSM nodes often carry a
// `name` + `amenity`/`shop` tag alongside the image, so this can use the
// same name+distance+category formula the TikTok/video-frame providers use
// rather than Mapillary's distance-only scale. Coverage is expected to be
// sparse for small hawker stalls — same as Wikimedia — this just quietly
// returns nothing when there's no tagged photo nearby.
import { computePhotoMatchConfidence } from "../photoMatching.js";
import { haversine } from "../../haversine.js";
import { photoDebugLog } from "./debugLog.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
// Wider than Mapillary's 50m — image-tagged OSM nodes are rare enough that a
// tight radius would almost never find one, and photoMatching.js's own
// distance decay (500m) already discounts anything far away.
const SEARCH_RADIUS_METERS = 150;
const MAX_CANDIDATES = 3;

function overpassQuery(lat, lng) {
  return `[out:json][timeout:25];(
    node(around:${SEARCH_RADIUS_METERS},${lat},${lng})["image"];
    node(around:${SEARCH_RADIUS_METERS},${lat},${lng})["wikimedia_commons"];
    way(around:${SEARCH_RADIUS_METERS},${lat},${lng})["image"];
    way(around:${SEARCH_RADIUS_METERS},${lat},${lng})["wikimedia_commons"];
  );out center tags;`;
}

// OSM's `image` tag is sometimes a direct file URL, sometimes a full Commons
// page URL, and `wikimedia_commons` is usually a bare "File:Name.jpg"
// reference — Commons' Special:FilePath endpoint resolves any of those
// (a filename or a full File: title) straight to the actual image bytes via
// a redirect, so this never needs Commons' separate query API.
function resolveImageUrl(tags) {
  const image = tags.image;
  if (image && /\.(jpe?g|png|gif|webp)$/i.test(image)) return image;

  const commonsRef = tags.wikimedia_commons || image || "";
  const fileMatch = commonsRef.match(/File:(.+)$/i);
  if (!fileMatch) return null;
  const filename = decodeURIComponent(fileMatch[1]);
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1024`;
}

export async function findOverpassCandidates(vendor) {
  if (vendor.latitude == null || vendor.longitude == null) {
    photoDebugLog("overpass", vendor.id, "skipped — vendor has no latitude/longitude");
    return [];
  }

  photoDebugLog("overpass", vendor.id, `request lat=${vendor.latitude} lng=${vendor.longitude} radius=${SEARCH_RADIUS_METERS}m`);

  let payload;
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: overpassQuery(vendor.latitude, vendor.longitude),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      photoDebugLog("overpass", vendor.id, `HTTP ${res.status} response body`, body);
      return []; // rate-limited/down — fail quiet, never crash discovery
    }
    payload = await res.json();
  } catch (err) {
    photoDebugLog("overpass", vendor.id, "request threw", err.message);
    return []; // network failure
  }

  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  photoDebugLog("overpass", vendor.id, `raw elements returned: ${elements.length}`, elements);
  if (!elements.length) return [];

  const candidates = elements
    .map((el) => {
      const tags = el.tags || {};
      const previewUrl = resolveImageUrl(tags);
      if (!previewUrl) return null;

      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const category = tags.amenity || tags.shop || tags.cuisine || null;

      const { confidence, breakdown } = computePhotoMatchConfidence({
        vendor,
        candidate: { placeName: tags.name || null, latitude: lat, longitude: lng, category },
      });

      const distanceMeters = lat != null && lng != null
        ? Math.round(haversine(vendor.latitude, vendor.longitude, lat, lng) * 1000)
        : null;

      return {
        provider: "overpass",
        placeName: tags.name || vendor.vendor_name,
        category,
        confidence,
        breakdown: {
          ...breakdown,
          distanceMeters,
          note: tags.name
            ? `OpenStreetMap photo tagged on "${tags.name}"${distanceMeters != null ? `, ${distanceMeters}m away` : ""} — please verify before confirming`
            : `OpenStreetMap photo tagged nearby (no name on the map data to confirm identity) — please verify before confirming`,
        },
        previewUrl,
        photoRef: previewUrl,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);

  photoDebugLog("overpass", vendor.id, `${candidates.length} candidate(s) after mapping`, candidates.map((c) => ({ confidence: c.confidence, distanceMeters: c.breakdown.distanceMeters, placeName: c.placeName })));
  return candidates;
}
