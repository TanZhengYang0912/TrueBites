// Reuses a vendor's own AI Content Upload source video as an image source —
// no TikTok URL field on the Add Vendor page, no admin-entered social link:
// this reads the vendor's existing `source_video_url` (already captured by
// the AI Content Upload workflow) and asks the Python AI service to extract
// a few candidate frames from that same video. Works identically for a
// brand-new vendor or one created long ago — the Python side just
// re-downloads the video on demand (TrueBites never keeps a durable copy of
// the video itself, only this URL — see services/downloader.py).
//
// Frame quality filtering (too dark / too blurry / near-duplicate) happens
// entirely on the Python side (services/frameExtractor.py) before any
// candidate ever reaches here.
const AI_SERVICE_BASE = process.env.AI_SERVICE_BASE || "http://localhost:8000";

// Extracted directly from the vendor's own confirmed source video, so
// identity is never in question (unlike Mapillary's coordinate guess) — only
// frame quality is. Base confidence scales with the sharpness score Python
// returns, capped so a merely-adequate frame doesn't auto-publish while a
// genuinely crisp one can.
const BASE_CONFIDENCE = 95;
// A real extraction (Chacos Berlauk source video) returned sharpness scores
// of 1043–1485 for its 5 kept frames — well above frameExtractor.py's reject
// floor (SHARPNESS_THRESHOLD=80), confirming that floor is intentionally
// lenient (better to let an admin reject a so-so frame than filter out a
// legitimate one). This constant is calibrated against that same real sample
// so confidence actually differentiates crisp frames from merely-adequate
// ones instead of every kept frame hitting the ceiling.
const SHARPNESS_FOR_FULL_CONFIDENCE = 1500;

export async function findVideoFrameCandidates(vendor) {
  if (!vendor.source_video_url) return [];

  let payload;
  try {
    const res = await fetch(`${AI_SERVICE_BASE}/api/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_url: vendor.source_video_url }),
      signal: AbortSignal.timeout(90_000), // video download + ffmpeg can genuinely take a while
    });
    if (!res.ok) return []; // AI service down, video rejected, etc — fail quiet, never crash discovery
    payload = await res.json();
  } catch {
    return []; // network failure / AI service unreachable / timed out
  }

  const frames = Array.isArray(payload?.frames) ? payload.frames : [];
  if (!frames.length) return [];

  return frames.map((frame) => {
    const qualityFactor = Math.min(1, frame.sharpness / SHARPNESS_FOR_FULL_CONFIDENCE);
    const confidence = Math.round(BASE_CONFIDENCE * qualityFactor);
    return {
      provider: "video_frame",
      placeName: vendor.vendor_name,
      category: null,
      confidence,
      breakdown: {
        matchedPlaceName: vendor.vendor_name,
        distanceMeters: null,
        nameSimilarityPct: null,
        category: null,
        categoryMatch: null,
        note: "Frame extracted from this vendor's own source video — please pick whichever shows the storefront/food best",
      },
      previewUrl: frame.url,
      photoRef: frame.url,
    };
  });
}
