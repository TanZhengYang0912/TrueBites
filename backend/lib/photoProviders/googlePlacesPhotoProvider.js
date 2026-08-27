// Google Places Photos — paid API, used deliberately in place of the free
// Mapillary/Overpass sources for the interactive "Find Photos Automatically"
// panel (project decision: Wikimedia stays as the free, name-based
// fallback — see index.js). This is a live REST call every time an admin
// clicks the button, unlike a free/keyless source; that's an accepted
// tradeoff for better coverage/accuracy than street-level or OSM-tagged
// photos.
//
// Two Google calls happen here per search: Find Place From Text (locates
// the vendor's own Google Place using its name, biased toward its
// coordinates) then Place Details (fetches that place's `photos` array). A
// third call happens per candidate ONLY when the admin's browser actually
// loads its preview <img> — via the /photos/google-preview proxy route in
// routes/vendors.js, never directly here. previewUrl below deliberately
// never contains a raw Google Places-photo URL: that requires the API key
// as a URL param, and putting a server-side key on an <img src> would leak
// it into the page's DOM/network tab for anyone to read and reuse. Only the
// backend (this file, and the proxy route) ever attaches GOOGLE_API_KEY to
// a request; the browser only ever talks to our own backend.
import { computePhotoMatchConfidence } from "../photoMatching.js";
import { photoDebugLog } from "./debugLog.js";

// Same convention as videoFrameProvider.js's PUBLIC_BASE_URL — the base URL
// used to build links back to our own backend for the browser to fetch.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const MAX_CANDIDATES = 3;
// Melaka shoplots sit metres apart — keep the bias tight so "Find Place"
// doesn't latch onto the wrong neighbour, matching Mapillary's own 50m-scale
// reasoning (see mapillaryProvider.js) rather than Overpass's wider 150m.
const LOCATION_BIAS_RADIUS_METERS = 75;

function previewUrlFor(vendorId, photoReference) {
  return `${PUBLIC_BASE_URL}/api/vendors/${vendorId}/photos/google-preview?ref=${encodeURIComponent(photoReference)}`;
}

export async function findGooglePlacesCandidates(vendor) {
  if (!GOOGLE_API_KEY) {
    photoDebugLog("google_places_photo", vendor.id, "skipped — GOOGLE_API_KEY is not set");
    return [];
  }
  if (!vendor.vendor_name) {
    photoDebugLog("google_places_photo", vendor.id, "skipped — vendor has no name to search for");
    return [];
  }
  if (vendor.latitude == null || vendor.longitude == null) {
    photoDebugLog("google_places_photo", vendor.id, "skipped — vendor has no latitude/longitude");
    return [];
  }

  const findParams = new URLSearchParams({
    input: vendor.vendor_name,
    inputtype: "textquery",
    locationbias: `circle:${LOCATION_BIAS_RADIUS_METERS}@${vendor.latitude},${vendor.longitude}`,
    fields: "place_id,name,geometry,types",
    key: GOOGLE_API_KEY,
  });

  photoDebugLog("google_places_photo", vendor.id, `Find Place request for "${vendor.vendor_name}" near ${vendor.latitude},${vendor.longitude} (bias ${LOCATION_BIAS_RADIUS_METERS}m)`);

  let findPayload;
  try {
    const res = await fetch(`${FIND_PLACE_URL}?${findParams}`);
    findPayload = await res.json();
  } catch (err) {
    photoDebugLog("google_places_photo", vendor.id, "Find Place request threw", err.message);
    return [];
  }

  photoDebugLog("google_places_photo", vendor.id, `Find Place status=${findPayload?.status}`, findPayload);
  // Never crash discovery over a bad/expired key or disabled API — the
  // admin still sees whatever other providers (Wikimedia) found.
  if (findPayload?.status !== "OK" || !findPayload.candidates?.length) return [];

  const place = findPayload.candidates[0];
  if (!place.place_id) return [];

  const detailsParams = new URLSearchParams({
    place_id: place.place_id,
    fields: "photos,name,geometry,types",
    key: GOOGLE_API_KEY,
  });

  let detailsPayload;
  try {
    const res = await fetch(`${DETAILS_URL}?${detailsParams}`);
    detailsPayload = await res.json();
  } catch (err) {
    photoDebugLog("google_places_photo", vendor.id, "Place Details request threw", err.message);
    return [];
  }

  photoDebugLog("google_places_photo", vendor.id, `Place Details status=${detailsPayload?.status}`, detailsPayload);
  if (detailsPayload?.status !== "OK") return [];

  const photos = Array.isArray(detailsPayload.result?.photos) ? detailsPayload.result.photos : [];
  if (!photos.length) {
    photoDebugLog("google_places_photo", vendor.id, `matched place "${detailsPayload.result?.name}" but it has no photos`);
    return [];
  }

  const placeLat = detailsPayload.result?.geometry?.location?.lat ?? place.geometry?.location?.lat;
  const placeLng = detailsPayload.result?.geometry?.location?.lng ?? place.geometry?.location?.lng;
  const placeName = detailsPayload.result?.name || place.name || vendor.vendor_name;
  const category = (detailsPayload.result?.types || place.types || [])[0] || null;

  // One match->confidence score for the found Place, shared across all of
  // its photos — they're all the same business, just different shots.
  const { confidence, breakdown } = computePhotoMatchConfidence({
    vendor,
    candidate: { placeName, latitude: placeLat, longitude: placeLng, category },
  });

  const candidates = photos.slice(0, MAX_CANDIDATES).map((photo, i) => ({
    provider: "google_places_photo",
    placeName,
    category,
    confidence,
    breakdown: {
      ...breakdown,
      note: `Google Places photo${photos.length > 1 ? ` (${i + 1}/${Math.min(photos.length, MAX_CANDIDATES)})` : ""} for "${placeName}" — please verify before confirming`,
    },
    previewUrl: previewUrlFor(vendor.id, photo.photo_reference),
    // Bare Google photo_reference, NOT a URL — routes/vendors.js's
    // /photos/commit rebuilds the real Google Photo URL server-side (with
    // the key) specifically for this provider, same reasoning as
    // previewUrl above.
    photoRef: photo.photo_reference,
    // Google's photo_reference is itself stable/reusable across calls (that
    // IS its purpose), so it doubles as the dedupe key directly.
    dedupeKey: photo.photo_reference,
  }));

  photoDebugLog("google_places_photo", vendor.id, `${candidates.length} candidate(s) after mapping`, candidates.map((c) => ({ confidence: c.confidence })));
  return candidates;
}
