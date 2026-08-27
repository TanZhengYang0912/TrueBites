// Free, keyless photo source: every vendor's own `source_video_url` (that's
// literally where the vendor record came from). TikTok's public oEmbed
// endpoint needs no auth/API key/billing and returns a `thumbnail_url` (a
// short-lived SIGNED CDN link — expires in ~2 days, never store it directly)
// plus the video's caption, which — per scripts/verifyVendorPhotos.js's
// already-proven approach — tells us whether the video actually names this
// specific vendor (single-shop video) or several ("N best X in Melaka"
// listicles, where every listed vendor shares one photo).
//
// This module backs both the on-demand /photos/discover + /commit endpoints
// and (via getTikTokOEmbed) scripts/fetchVendorTiktokThumbnails.js, so the
// batch tool and the admin-triggered discovery panel can never drift apart.
import { captionMatchConfidence } from "../photoMatching.js";
import { photoDebugLog } from "./debugLog.js";

export async function getTikTokOEmbed(videoUrl) {
  const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  const res = await fetch(url);
  if (!res.ok) return null; // 404 = deleted/private video
  const data = await res.json();
  if (!data.thumbnail_url) return null;
  return { thumbnailUrl: data.thumbnail_url, caption: data.title || null };
}

// Preview-only — no bytes downloaded, nothing written. Safe to call every
// time an admin clicks "Find Photos Automatically" without worrying about
// storage cost; only lib/photoProviders/photoStorage.js's
// downloadAndStorePhoto actually persists anything, and only for the one
// candidate the admin picks. Returns an array (0 or 1 item, since a vendor
// has at most one source video) so this provider's shape matches every other
// provider's — the discovery endpoint just concatenates whatever each
// provider finds.
export async function findTikTokCandidates(vendor) {
  if (!vendor.source_video_url || !/tiktok\.com/i.test(vendor.source_video_url)) {
    photoDebugLog("tiktok_oembed", vendor.id, "skipped — no TikTok source_video_url on this vendor");
    return [];
  }

  const oembed = await getTikTokOEmbed(vendor.source_video_url);
  if (!oembed) {
    photoDebugLog("tiktok_oembed", vendor.id, "oEmbed lookup returned nothing — video may be deleted/private, or expired");
    return [];
  }
  photoDebugLog("tiktok_oembed", vendor.id, "oEmbed caption", oembed.caption);

  const { confidence, matched } = captionMatchConfidence(vendor.vendor_name, oembed.caption || "");
  photoDebugLog("tiktok_oembed", vendor.id, `confidence=${confidence} matched=[${matched.join(", ")}]`);

  return [{
    provider: "tiktok_oembed",
    placeName: vendor.vendor_name,
    category: null,
    confidence,
    breakdown: {
      matchedPlaceName: vendor.vendor_name,
      distanceMeters: null,
      nameSimilarityPct: confidence,
      category: null,
      categoryMatch: null,
      note: matched.length
        ? `Video caption names this vendor (matched: ${matched.join(", ")})`
        : "Video is this vendor's own recorded source — not a shared listicle",
    },
    previewUrl: oembed.thumbnailUrl,
    photoRef: oembed.thumbnailUrl,
    // thumbnailUrl is a short-lived SIGNED CDN link (expires in ~2 days,
    // re-signed differently on every oEmbed call) — not reusable for "was
    // this already committed?" checks. The vendor's own source_video_url is
    // stable and this provider only ever returns the one thumbnail tied to
    // it, so it's a correct dedupe key on its own.
    dedupeKey: vendor.source_video_url,
  }];
}
