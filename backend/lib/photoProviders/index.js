// Provider registry for automatic vendor-photo discovery. Plain functions,
// not classes — matches the rest of this codebase's style. Every provider
// exposes a `findCandidates(vendor) -> candidate[]` shape (see
// mapillaryProvider.js / tiktokOEmbedProvider.js for the exact fields); the
// discover endpoint calls each registered provider and lets
// photoMatching.js's confidence thresholds decide what's worth showing an
// admin. A paid googlePlacesPhotoProvider.js is intentionally NOT
// implemented — this project explicitly avoids depending on a paid Google
// Places API; free/registration-only sources only.
//
// Two tiers, tried in priority order (see PROJECT SCOPE section 14, "Cover
// Image priority" + the "Image Source Priority" cascade this module
// implements): a vendor with its own AI-Content-Upload source video gets its
// real frames/thumbnail from THAT video first — an actual photo of this
// exact vendor beats a "probably nearby" guess — and only falls through to
// the location-based tier (Mapillary street-level, Overpass/OSM tagged
// photos, Wikimedia Commons as the narrowest fallback) when the video tier
// comes up empty, or the vendor never had a video to begin with. This also
// means a vendor with a working video never pays for the external
// Mapillary/Overpass/Wikimedia calls at all — fewer requests against those
// free/rate-limited APIs.
//
// A flickrProvider.js used to sit in the location tier too — removed since
// FLICKR_API_KEY was never configured (Flickr now requires a paid Flickr Pro
// subscription to even create a key) and it never contributed a single
// candidate. Re-adding it needs an actual key first.
import { findMapillaryCandidates } from "./mapillaryProvider.js";
import { findOverpassCandidates } from "./overpassProvider.js";
import { findVideoFrameCandidates } from "./videoFrameProvider.js";
import { findTikTokCandidates } from "./tiktokOEmbedProvider.js";
import { findWikimediaCandidates } from "./wikimediaProvider.js";
import { NEEDS_CONFIRMATION_THRESHOLD } from "../photoMatching.js";

const VIDEO_PROVIDERS = [
  { name: "video_frame", findCandidates: findVideoFrameCandidates },
  { name: "tiktok_oembed", findCandidates: findTikTokCandidates },
];
const LOCATION_PROVIDERS = [
  { name: "mapillary", findCandidates: findMapillaryCandidates },
  { name: "overpass", findCandidates: findOverpassCandidates },
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
async function runTier(providers, vendor) {
  const results = await Promise.allSettled(providers.map(({ findCandidates }) => findCandidates(vendor)));

  const candidates = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`photo provider "${providers[i].name}" failed for vendor ${vendor.id}:`, result.reason?.message);
      return;
    }
    for (const candidate of result.value) {
      if (!candidate) continue;
      const confidence = FOOD_CONTENT_PROVIDERS.has(candidate.provider)
        ? Math.min(100, candidate.confidence + FOOD_CONTENT_BONUS)
        : candidate.confidence;
      if (confidence >= NEEDS_CONFIRMATION_THRESHOLD) {
        candidates.push({ ...candidate, confidence });
      }
    }
  });
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export async function discoverVendorPhotos(vendor) {
  if (vendor.source_video_url) {
    const videoCandidates = await runTier(VIDEO_PROVIDERS, vendor);
    if (videoCandidates.length) return videoCandidates;
  }
  return runTier(LOCATION_PROVIDERS, vendor);
}

export { describeManualUpload } from "./manualUploadProvider.js";
export { downloadAndStorePhoto } from "./photoStorage.js";
