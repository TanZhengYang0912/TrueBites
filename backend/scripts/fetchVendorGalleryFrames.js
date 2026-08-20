/**
 * Batch-fill vendor GALLERY photos (the "food/interior" slides shown after
 * the cover in the card-hover / detail-modal auto-swipe carousel) by
 * extracting real frames from each vendor's own TikTok source video —
 * free, no API key, no Google Places.
 *
 * Unlike fetchVendorTiktokThumbnails.js (which pulls ONE oEmbed thumbnail
 * per vendor for the COVER), this calls lib/ai/frameExtractor.js directly
 * (in-process — no separate AI service to run anymore), which downloads
 * the actual video and returns several quality-filtered candidate frames
 * (blurry/dark/near-duplicate ones already discarded).
 *
 * SCOPE — only vendors that already have a trustworthy storefront_image_url:
 * some vendors' only video is a "N best X in Melaka" listicle covering
 * several shops at once, and verifyVendorPhotos.js already identified and
 * cleared storefront_image_url for the ones that video can't be confidently
 * attributed to (see scripts/vendor_photo_audit.json). Reusing the SAME
 * video for gallery photos on those vendors would just reintroduce that
 * misattribution — so this script deliberately only processes vendors that
 * still have a cover set (i.e. the video is either uniquely theirs, or they
 * won a shared-video group).
 *
 * SLOW: each vendor requires a real video download + several ffmpeg frame
 * extractions server-side — tens of seconds each, not the ~1s an oEmbed
 * thumbnail call takes. Budget accordingly; --limit a small batch first.
 *
 * Usage:
 *   node scripts/fetchVendorGalleryFrames.js --yes                  # full run
 *   node scripts/fetchVendorGalleryFrames.js --yes --limit=10       # try a few first
 *   node scripts/fetchVendorGalleryFrames.js --yes --vendor-id=<id> # one vendor
 *   node scripts/fetchVendorGalleryFrames.js --yes --retry-empty    # re-check
 *     vendors already marked "done" that ended up with zero photos — e.g.
 *     after lowering frameExtractor.py's SHARPNESS_THRESHOLD, to pick up
 *     frames that would've been rejected as "too blurry" under the old bar.
 *     Vendors that already got at least one photo are left alone either way.
 *   node scripts/fetchVendorGalleryFrames.js --yes --force          # ignore
 *     the "done" log entirely and re-run every eligible vendor — expensive,
 *     re-downloads+re-extracts even ones that already succeeded; --retry-empty
 *     is almost always what you actually want instead.
 *
 * Requirements:
 *   - backend/.env must have SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   - ffmpeg/ffprobe on PATH, and a yt-dlp binary (run
 *     `npm run setup:ytdlp` once if backend/bin/yt-dlp.exe doesn't exist yet)
 */

import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { extractFrames } from "../lib/ai/frameExtractor.js";
import { uploadLocalPhoto } from "../lib/photoProviders/photoStorage.js";
import { MAX_GALLERY_IMAGES } from "../lib/vendorValidation.js";

// ── Config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const CONFIRMED = flag("yes");
const FORCE = flag("force");
const RETRY_EMPTY = flag("retry-empty");
const LIMIT = opt("limit") ? parseInt(opt("limit"), 10) : null;
const ONLY_VENDOR_ID = opt("vendor-id");
const GALLERY_TARGET = Math.min(MAX_GALLERY_IMAGES, parseInt(opt("gallery-target", "4"), 10));
const DELAY_MS = 1000; // extra courtesy pause between vendors (each call itself already takes ~20s)
const LOG_PATH = path.resolve("scripts/fetch_vendor_gallery_frames_log.json");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

if (!CONFIRMED) {
  console.log(
    "This downloads each vendor's video (locally, via ffmpeg/yt-dlp) and\n" +
    "writes real storage/DB changes. Free, no API key — but slow (tens of\n" +
    "seconds per vendor) and a real write to the shared vendor-images\n" +
    "bucket + vendors table. Re-run with --yes once you're ready (ideally\n" +
    "try --limit=5 first)."
  );
  process.exit(0);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function loadLog() {
  if (fs.existsSync(LOG_PATH)) return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  return { done: [] };
}
function saveLog(log) { fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2)); }

// Avoids duplicate ids piling up in the log under --retry-empty/--force,
// where a vendor already in `done` can be processed again.
function markDone(log, id) {
  if (!log.done.includes(id)) log.done.push(id);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  let query = supabase
    .from("vendors")
    .select("id, vendor_name, source_video_url, storefront_image_url, gallery_image_urls");
  if (ONLY_VENDOR_ID) query = query.eq("id", ONLY_VENDOR_ID);
  const { data: vendors, error } = await query;
  if (error) { console.error("❌  failed to load vendors:", error.message); process.exit(1); }

  // Only vendors with a TRUSTWORTHY cover (see file header) and room left in
  // their gallery — a vendor already at/above GALLERY_TARGET is left alone.
  const eligible = vendors.filter((v) =>
    v.storefront_image_url &&
    v.source_video_url && /tiktok\.com/i.test(v.source_video_url) &&
    (Array.isArray(v.gallery_image_urls) ? v.gallery_image_urls.length : 0) < GALLERY_TARGET
  );

  const log = loadLog();
  const doneSet = new Set(log.done);
  const hasNoPhotos = (v) => !(Array.isArray(v.gallery_image_urls) && v.gallery_image_urls.length > 0);
  let pending;
  if (FORCE) {
    pending = eligible;
  } else if (RETRY_EMPTY) {
    pending = eligible.filter((v) => !doneSet.has(v.id) || hasNoPhotos(v));
  } else {
    pending = eligible.filter((v) => !doneSet.has(v.id));
  }
  if (LIMIT) pending = pending.slice(0, LIMIT);

  console.log(`📄  ${vendors.length} vendors total | ${eligible.length} eligible for gallery backfill | ${pending.length} to process this run`);
  console.log(`⏱   budget ~20-30s/vendor — this run may take a while\n`);

  let ok = 0, noFrames = 0, failed = 0, totalUploaded = 0;

  for (let i = 0; i < pending.length; i++) {
    const vendor = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] ${vendor.vendor_name} ... `);

    try {
      const frames = await extractFrames(vendor.source_video_url, `frames-${vendor.id}`);
      if (!frames.length) { console.log("⚠️  no usable frames extracted"); noFrames++; markDone(log, vendor.id); continue; }

      const existing = Array.isArray(vendor.gallery_image_urls) ? [...vendor.gallery_image_urls] : [];
      const room = GALLERY_TARGET - existing.length;
      const toUpload = frames.slice(0, Math.max(0, room));

      const uploaded = [];
      for (const frame of toUpload) {
        const { url } = await uploadLocalPhoto(vendor.id, frame.path, "gallery");
        uploaded.push(url);
      }

      const gallery_image_urls = [...existing, ...uploaded];
      const { error: updateErr } = await supabase
        .from("vendors")
        .update({ gallery_image_urls })
        .eq("id", vendor.id);
      if (updateErr) throw new Error(updateErr.message);

      console.log(`✅  +${uploaded.length} photo(s)`);
      ok++;
      totalUploaded += uploaded.length;
    } catch (err) {
      console.log(`❌  ${err.message}`);
      failed++;
    }

    markDone(log, vendor.id);
    if ((i + 1) % 5 === 0) saveLog(log);
    await sleep(DELAY_MS);
  }

  saveLog(log);
  console.log(`\n✅  Done — ok: ${ok} | no frames: ${noFrames} | failed: ${failed} | total photos added: ${totalUploaded}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
