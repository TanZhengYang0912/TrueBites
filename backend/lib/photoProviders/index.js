// Provider registry for automatic vendor-photo discovery. Plain functions,
// not classes — matches the rest of this codebase's style. Every provider
// exposes a `findCandidates(vendor) -> candidate[]` shape (see
// mapillaryProvider.js / flickrProvider.js / tiktokOEmbedProvider.js for the
// exact fields); the discover endpoint calls each registered provider and
// lets photoMatching.js's confidence thresholds decide what's worth showing
// an admin. A paid googlePlacesPhotoProvider.js is intentionally NOT
// implemented — this project explicitly avoids depending on a paid Google
// Places API; free/registration-only sources only.
//
// Ordered by how strong a storefront/exterior signal each source gives (see
// PROJECT SCOPE section 14, "Cover Image priority"): Mapillary's street-level
// imagery first, Flickr's food/interior photos second, then the vendor's own
// AI-Content-Upload source video (via frame extraction) and the same video's
// TikTok oEmbed thumbnail — both only exist per-vendor when a source video
// was captured for it — and finally Wikimedia Commons, the narrowest
// fallback (mostly documents locally-famous places, not ordinary stalls).
// Order only affects candidate list ordering, not which role (cover/gallery)
// a candidate is used for — that's the admin's choice.
//
// Flickr requires a paid Flickr Pro subscription to even create an API key
// now (confirmed directly against their current signup flow), so it's kept
// registered — already-issued keys still work — but nothing in this project
// depends on obtaining a new one.
import { findMapillaryCandidates } from "./mapillaryProvider.js";
import { findFlickrCandidates } from "./flickrProvider.js";
import { findVideoFrameCandidates } from "./videoFrameProvider.js";
import { findTikTokCandidates } from "./tiktokOEmbedProvider.js";
import { findWikimediaCandidates } from "./wikimediaProvider.js";
import { NEEDS_CONFIRMATION_THRESHOLD } from "../photoMatching.js";

const DISCOVERY_PROVIDERS = [
  { name: "mapillary", findCandidates: findMapillaryCandidates },
  { name: "flickr", findCandidates: findFlickrCandidates },
  { name: "video_frame", findCandidates: findVideoFrameCandidates },
  { name: "tiktok_oembed", findCandidates: findTikTokCandidates },
  { name: "wikimedia", findCandidates: findWikimediaCandidates },
];

// Runs every registered provider for one vendor IN PARALLEL — video frame
// extraction (download + ffmpeg) can take tens of seconds, much slower than
// the other providers' plain API calls, so running providers one after
// another would make every search wait on the slowest one even when nobody
// needs it. Each provider's own errors are still caught individually so one
// dead/rate-limited/unconfigured/slow provider never fails the whole request
// — the admin still sees results from whatever else worked.
export async function discoverVendorPhotos(vendor) {
  const results = await Promise.allSettled(
    DISCOVERY_PROVIDERS.map(({ findCandidates }) => findCandidates(vendor))
  );

  const candidates = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`photo provider "${DISCOVERY_PROVIDERS[i].name}" failed for vendor ${vendor.id}:`, result.reason?.message);
      return;
    }
    for (const candidate of result.value) {
      if (candidate && candidate.confidence >= NEEDS_CONFIRMATION_THRESHOLD) {
        candidates.push(candidate);
      }
    }
  });
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export { describeManualUpload } from "./manualUploadProvider.js";
export { downloadAndStorePhoto } from "./photoStorage.js";
