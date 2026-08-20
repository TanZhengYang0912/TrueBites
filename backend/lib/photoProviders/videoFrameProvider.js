// Reuses a vendor's own AI Content Upload source video as an image source —
// no TikTok URL field on the Add Vendor page, no admin-entered social link:
// this reads the vendor's existing `source_video_url` (already captured by
// the AI Content Upload workflow) and extracts a few candidate frames from
// that same video. Works identically for a brand-new vendor or one created
// long ago — TrueBites never keeps a durable copy of the video itself, only
// this URL, so extraction re-downloads it on demand every time.
//
// Frame quality filtering (too dark / too blurry / near-duplicate) happens
// entirely inside lib/ai/frameExtractor.js before any candidate ever
// reaches here — this used to be a fetch() to a separate Python AI service;
// now it's a direct in-process call, no network hop, no second server.
import { randomUUID } from "node:crypto";
import { extractFrames } from "../ai/frameExtractor.js";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

// Extracted directly from the vendor's own confirmed source video, so
// identity is never in question (unlike Mapillary's coordinate guess) — only
// frame quality is. Base confidence scales with the sharpness score
// returns, capped so a merely-adequate frame doesn't auto-publish while a
// genuinely crisp one can.
const BASE_CONFIDENCE = 95;
// A real extraction (Chacos Berlauk source video) returned sharpness scores
// of 1043–1485 for its 5 kept frames — well above frameExtractor.js's reject
// floor (SHARPNESS_THRESHOLD=55), confirming that floor is intentionally
// lenient (better to let an admin reject a so-so frame than filter out a
// legitimate one). This constant is calibrated against that same real sample
// so confidence actually differentiates crisp frames from merely-adequate
// ones instead of every kept frame hitting the ceiling.
const SHARPNESS_FOR_FULL_CONFIDENCE = 1500;

export async function findVideoFrameCandidates(vendor) {
  if (!vendor.source_video_url) return [];

  // "frames-<uuid>" matches the job-directory naming convention every
  // other extract-frames call uses under backend/outputs/.
  const jobId = `frames-${randomUUID()}`;
  let frames;
  try {
    frames = await extractFrames(vendor.source_video_url, jobId);
  } catch {
    return []; // download/extraction failed — fail quiet, never crash discovery
  }
  if (!frames.length) return [];

  return frames.map((frame) => {
    const qualityFactor = Math.min(1, frame.sharpness / SHARPNESS_FOR_FULL_CONFIDENCE);
    const confidence = Math.round(BASE_CONFIDENCE * qualityFactor);
    const url = `${PUBLIC_BASE_URL}/outputs/${jobId}/frames/${frame.filename}`;
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
      previewUrl: url,
      photoRef: url,
    };
  });
}
