/**
 * Batch-fetch FREE storefront cover photos from each vendor's own TikTok
 * source video — no API key, no billing, no Google Places involved.
 *
 * Every vendor row already carries `source_video_url` (that's literally where
 * the vendor was scraped from). TikTok's public oEmbed endpoint
 * (https://www.tiktok.com/oembed?url=...) is free and unauthenticated and
 * returns a `thumbnail_url` for that video — a real frame tied to that exact
 * vendor, not a random stock photo.
 *
 * IMPORTANT: that thumbnail_url is a short-lived SIGNED CDN link (expires in
 * a couple of days), so it can never be stored directly as
 * storefront_image_url. This script downloads the bytes immediately and
 * re-uploads them into Supabase Storage (same bucket/convention as the
 * existing image-upload endpoint), then stores the permanent Supabase URL.
 *
 * Only fills `storefront_image_url` — it does NOT touch storage/DB for
 * vendors that already have one, unless --force is passed. This is oEmbed,
 * not the paid Places API — no gallery photos come out of it; the existing
 * fallback chain in vendorDisplay.js (curated food-photo manifest → category
 * stock photo) still covers the "food photos after the cover" slides.
 *
 * Usage:
 *   node scripts/fetchVendorTiktokThumbnails.js --yes                  # full run
 *   node scripts/fetchVendorTiktokThumbnails.js --yes --limit=5        # try a few first
 *   node scripts/fetchVendorTiktokThumbnails.js --yes --vendor-id=<id> # one vendor
 *   node scripts/fetchVendorTiktokThumbnails.js --yes --force          # also replace
 *                                                                       # existing photos
 *
 * Requirements:
 *   - backend/.env must have SUPABASE_URL, SUPABASE_SERVICE_KEY (no Google key needed)
 *   - Supabase "vendor-images" storage bucket must already exist (it does — see
 *     the schema comment in routes/vendors.js)
 */

import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { getTikTokOEmbed } from "../lib/photoProviders/tiktokOEmbedProvider.js";
import { downloadAndStorePhoto } from "../lib/photoProviders/photoStorage.js";

// ── Config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const CONFIRMED = flag("yes");
const FORCE = flag("force");
const LIMIT = opt("limit") ? parseInt(opt("limit"), 10) : null;
const ONLY_VENDOR_ID = opt("vendor-id");
const DELAY_MS = 400; // be polite to TikTok's unauthenticated oEmbed endpoint
const LOG_PATH = path.resolve("scripts/fetch_vendor_tiktok_log.json");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

if (!CONFIRMED) {
  console.log(
    "This downloads a thumbnail from each vendor's TikTok source video and\n" +
    "writes real storage/DB changes. Free, no API key — but still a real\n" +
    "write to the shared vendor-images bucket + vendors table. Re-run with\n" +
    "--yes once you're ready (ideally try --limit=10 first)."
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

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  let query = supabase
    .from("vendors")
    .select("id, vendor_name, source_video_url, storefront_image_url");
  if (ONLY_VENDOR_ID) query = query.eq("id", ONLY_VENDOR_ID);
  const { data: vendors, error } = await query;
  if (error) { console.error("❌  failed to load vendors:", error.message); process.exit(1); }

  const withVideo = vendors.filter((v) => v.source_video_url && /tiktok\.com/i.test(v.source_video_url));

  const log = loadLog();
  const doneSet = new Set(log.done);
  let pending = withVideo.filter((v) => FORCE || (!doneSet.has(v.id) && !v.storefront_image_url));
  if (LIMIT) pending = pending.slice(0, LIMIT);

  console.log(`📄  ${vendors.length} vendors total | ${withVideo.length} have a TikTok source video | ${pending.length} to process this run`);

  let ok = 0, noThumbnail = 0, failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const vendor = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] ${vendor.vendor_name} ... `);

    try {
      const oembed = await getTikTokOEmbed(vendor.source_video_url);
      if (!oembed) { console.log("⚠️  no oEmbed thumbnail (video deleted/private?)"); noThumbnail++; log.done.push(vendor.id); continue; }
      await sleep(DELAY_MS);

      const { url: publicUrl } = await downloadAndStorePhoto(vendor.id, oembed.thumbnailUrl, "storefront");

      const { error: updateErr } = await supabase
        .from("vendors")
        .update({ storefront_image_url: publicUrl })
        .eq("id", vendor.id);
      if (updateErr) throw new Error(updateErr.message);

      console.log("✅");
      ok++;
    } catch (err) {
      console.log(`❌  ${err.message}`);
      failed++;
    }

    log.done.push(vendor.id);
    if ((i + 1) % 10 === 0) saveLog(log);
    await sleep(DELAY_MS);
  }

  saveLog(log);
  console.log(`\n✅  Done — ok: ${ok} | no thumbnail: ${noThumbnail} | failed: ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
