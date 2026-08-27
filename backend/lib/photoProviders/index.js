// Provider registry for automatic vendor-photo discovery. Plain functions,
// not classes — matches the rest of this codebase's style. Every provider
// exposes a `findCandidates(vendor) -> candidate[]` shape (see
// googlePlacesPhotoProvider.js / tiktokOEmbedProvider.js for the exact
// fields); the discover endpoint calls each registered provider and lets
// photoMatching.js's confidence thresholds decide what's worth showing an
// admin.
//
// Two tiers, tried in priority order (see PROJECT SCOPE section 14, "Cover
// Image priority" + the "Image Source Priority" cascade this module
// implements): a vendor with its own AI-Content-Upload source video gets its
// real frames/thumbnail from THAT video first — an actual photo of this
// exact vendor beats a "probably nearby" guess — and only falls through to
// the location-based tier (Google Places Photos, then Wikimedia Commons as
// the free, name-based fallback) when the video tier comes up empty, or the
// vendor never had a video to begin with. This also means a vendor with a
// working video never triggers the paid Google Places calls at all.
//
// Mapillary and Overpass/OSM used to sit in this tier too — replaced by
// Google Places Photos everywhere, both this live discovery endpoint and
// scripts/fetchVendorCoverPhotos.js's unsupervised batch-backfill (project
// decision: coverage/accuracy over avoiding a paid API here). Their provider
// modules (mapillaryProvider.js, overpassProvider.js) have been removed —
// nothing imports them any more.
//
// A flickrProvider.js used to sit in the location tier too — removed since
// FLICKR_API_KEY was never configured (Flickr now requires a paid Flickr Pro
// subscription to even create a key) and it never contributed a single
// candidate. Re-adding it needs an actual key first.
import { findGooglePlacesCandidates } from "./googlePlacesPhotoProvider.js";
import { findVideoFrameCandidates } from "./videoFrameProvider.js";
import { findTikTokCandidates } from "./tiktokOEmbedProvider.js";
import { findWikimediaCandidates } from "./wikimediaProvider.js";
import { NEEDS_CONFIRMATION_THRESHOLD } from "../photoMatching.js";
import { photoDebugLog } from "./debugLog.js";

const VIDEO_PROVIDERS = [
  { name: "video_frame", findCandidates: findVideoFrameCandidates },
  { name: "tiktok_oembed", findCandidates: findTikTokCandidates },
];
const LOCATION_PROVIDERS = [
  { name: "google_places_photo", findCandidates: findGooglePlacesCandidates },
  { name: "wikimedia", findCandidates: findWikimediaCandidates },
];

// video_frame and tiktok_oembed are the only two sources guaranteed to show
// actual food/interior content — both come from the vendor's own captured
// video, not a street-level pass-by (Mapillary) or a random nearby OSM node
// (Overpass), neither of which has any way to know it's even looking at
// food. Per project direction, the gallery should favour real food shots
// over a technically sharper exterior photo, so these two get a modest
// confidence bump ahead of the threshold filter/sort below.
const FOOD_CONTENT_PROVIDERS = new Set(["video_frame", "tiktok_oembed"]);
const FOOD_CONTENT_BONUS = 8;

// Runs one tier of providers for a vendor IN PARALLEL — video frame
// extraction (download + ffmpeg) can take tens of seconds, much slower than
// the other providers' plain API calls, so running providers one after
// another would make every search wait on the slowest one even when nobody
// needs it. Each provider's own errors are still caught individually so one
// dead/rate-limited/unconfigured/slow provider never fails the whole tier —
// the admin still sees results from whatever else worked.
//
// `usedKeys` is a Set of "provider::dedupeKey" strings for photos already
// committed (as cover OR gallery) for this vendor, built by the route from
// vendor_photos — a candidate matching one is dropped before it ever reaches
// the admin, so "Search Again" can't resurface something already used. Each
// provider sets its own `dedupeKey`, distinct from `photoRef`, specifically
// because several providers' photoRef values aren't stable across repeated
// searches (a fresh signed CDN URL, a fresh random extraction-job path) even
// when they represent the exact same underlying photo — see each provider's
// own dedupeKey comment.
async function runTier(providers, vendor, usedKeys) {
  const results = await Promise.allSettled(providers.map(({ findCandidates }) => findCandidates(vendor)));

  const candidates = [];
  const droppedBelowThreshold = [];
  const droppedAlreadyUsed = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`photo provider "${providers[i].name}" failed for vendor ${vendor.id}:`, result.reason?.message);
      photoDebugLog(providers[i].name, vendor.id, "provider threw (see console.error above)", result.reason?.message);
      return;
    }
    for (const candidate of result.value) {
      if (!candidate) continue;
      if (candidate.dedupeKey && usedKeys.has(`${candidate.provider}::${candidate.dedupeKey}`)) {
        droppedAlreadyUsed.push({ provider: candidate.provider, dedupeKey: candidate.dedupeKey });
        continue;
      }
      const confidence = FOOD_CONTENT_PROVIDERS.has(candidate.provider)
        ? Math.min(100, candidate.confidence + FOOD_CONTENT_BONUS)
        : candidate.confidence;
      if (confidence >= NEEDS_CONFIRMATION_THRESHOLD) {
        candidates.push({ ...candidate, confidence });
      } else {
        droppedBelowThreshold.push({ provider: candidate.provider, confidence });
      }
    }
  });
  if (droppedAlreadyUsed.length) {
    photoDebugLog("tier", vendor.id, `${droppedAlreadyUsed.length} candidate(s) dropped — already committed for this vendor`, droppedAlreadyUsed);
  }
  if (droppedBelowThreshold.length) {
    photoDebugLog("tier", vendor.id, `${droppedBelowThreshold.length} candidate(s) dropped below NEEDS_CONFIRMATION_THRESHOLD=${NEEDS_CONFIRMATION_THRESHOLD}`, droppedBelowThreshold);
  }
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// `usedKeys`: see runTier's comment above — pass an empty Set when the
// caller has no prior-commit history to check (e.g. a script running
// outside the vendor_photos-backed admin panel).
export async function discoverVendorPhotos(vendor, usedKeys = new Set()) {
  photoDebugLog("discover", vendor.id, `starting — has source_video_url=${Boolean(vendor.source_video_url)} lat=${vendor.latitude} lng=${vendor.longitude} already-used=${usedKeys.size}`);

  if (vendor.source_video_url) {
    const videoCandidates = await runTier(VIDEO_PROVIDERS, vendor, usedKeys);
    photoDebugLog("discover", vendor.id, `video tier produced ${videoCandidates.length} candidate(s)`);
    if (videoCandidates.length) return videoCandidates;
  }
  const locationCandidates = await runTier(LOCATION_PROVIDERS, vendor, usedKeys);
  photoDebugLog("discover", vendor.id, `location tier produced ${locationCandidates.length} candidate(s)`);
  return locationCandidates;
}

export { describeManualUpload } from "./manualUploadProvider.js";
export { downloadAndStorePhoto } from "./photoStorage.js";
