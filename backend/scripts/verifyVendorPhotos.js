/**
 * Audit storefront photos for vendor-name correspondence — and clear the ones
 * that provably belong to a different shop.
 *
 * WHY THIS EXISTS
 * Storefront photos were sourced for free from each vendor's own TikTok
 * `source_video_url` (see fetchVendorTiktokThumbnails.js). That guarantees the
 * photo matches the SOURCE VIDEO — but not the VENDOR NAME, because a single
 * "5 nasi ayam terbaik di Melaka" listicle video yields several vendor rows,
 * and every one of them gets the same cover frame. Measured on the live data:
 * 565 distinct videos across 603 vendors, 23 videos shared by more than one
 * vendor, so at least 36 vendors (6%) were showing a competitor's storefront.
 *
 * THE FREE SIGNAL
 * The same oEmbed response also carries the video caption, which separates the
 * two cases cleanly:
 *   single-vendor -> "Nama Kedai : CHACOS BERLAUK  Alamat: Eye On Melaka..."   (names the shop)
 *   listicle      -> "5 nasi ayam terbaik di melaka. part 1"                   (names nobody)
 * So within a shared-video group we can hand the photo to the one vendor the
 * caption actually names, and clear the rest.
 *
 * WHAT IT CHANGES
 * Only vendors that share a source video with another vendor are ever cleared.
 * A vendor with its own video keeps its photo unconditionally (the association
 * is sound) and is merely scored for the report.
 *
 * Dry-run by default — prints the full decision table and writes nothing.
 * Pass --apply to actually null out storefront_image_url and delete the
 * orphaned storage objects.
 *
 * Usage:
 *   node scripts/verifyVendorPhotos.js                 # dry run (default)
 *   node scripts/verifyVendorPhotos.js --apply         # actually remediate
 *   node scripts/verifyVendorPhotos.js --limit=5       # only the first N shared groups
 *
 * Requirements:
 *   - backend/.env must have SUPABASE_URL, SUPABASE_SERVICE_KEY (no Google key needed)
 */

import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { STORAGE_BUCKET, storagePathFromUrl } from "../lib/vendorValidation.js";
import { captionMatchConfidence } from "../lib/photoMatching.js";

// ── Config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const APPLY = flag("apply");
const LIMIT = opt("limit") ? parseInt(opt("limit"), 10) : null;
const DELAY_MS = 400; // same spacing the thumbnail script uses
const REPORT_PATH = path.resolve("scripts/vendor_photo_audit.json");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MATCH_THRESHOLD = 0.5;

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Thin adapter over lib/photoMatching.js's captionMatchConfidence (0-100
// scale, shared with the on-demand photo-discovery endpoint) so the rest of
// this script's math/output (0-1 `score`, unchanged since this script last
// ran and was verified) doesn't need to change.
function scoreNameAgainstCaption(vendorName, caption) {
  const { confidence, matched, distinctive } = captionMatchConfidence(vendorName, caption);
  return { score: confidence / 100, matched, distinctive };
}

async function getCaption(videoUrl) {
  const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  const res = await fetch(url);
  if (!res.ok) return null; // 404 = deleted/private video
  const data = await res.json();
  return data.title || null;
}

const videoId = (url) => String(url || "").split("/video/")[1] || url;

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const { data: vendors, error } = await supabase
    .from("vendors")
    .select("id, vendor_name, source_video_url, storefront_image_url");
  if (error) { console.error("❌  failed to load vendors:", error.message); process.exit(1); }

  const byVideo = new Map();
  for (const v of vendors) {
    if (!v.source_video_url) continue;
    if (!byVideo.has(v.source_video_url)) byVideo.set(v.source_video_url, []);
    byVideo.get(v.source_video_url).push(v);
  }

  let sharedGroups = [...byVideo.entries()].filter(([, group]) => group.length > 1);
  if (LIMIT) sharedGroups = sharedGroups.slice(0, LIMIT);

  console.log(`📄  ${vendors.length} vendors | ${byVideo.size} distinct videos | ${sharedGroups.length} shared by >1 vendor`);
  console.log(APPLY ? "⚠️   APPLY MODE — this will write to the database and delete storage objects\n" : "🔍  DRY RUN — nothing will be written (pass --apply to remediate)\n");

  const report = [];
  const toClear = [];

  for (const [url, group] of sharedGroups) {
    const caption = await getCaption(url);
    await sleep(DELAY_MS);

    const scored = group
      .map((v) => ({ vendor: v, ...scoreNameAgainstCaption(v.vendor_name, caption || "") }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    // A winner must clear the threshold AND have matched something distinctive —
    // otherwise the caption doesn't actually identify any of them (listicle).
    const winner = best && best.score >= MATCH_THRESHOLD && best.matched.length ? best : null;
    // A tie at the top is not an identification either.
    const tied = winner && scored.filter((s) => s.score === winner.score).length > 1;
    const decidedWinner = tied ? null : winner;

    console.log(`🎬  ${videoId(url)} — ${group.length} vendors`);
    console.log(`    caption: ${caption ? String(caption).replace(/\s+/g, " ").slice(0, 110) : "(unavailable)"}`);

    for (const s of scored) {
      const isWinner = decidedWinner && s.vendor.id === decidedWinner.vendor.id;
      const hasPhoto = Boolean(s.vendor.storefront_image_url);
      const decision = isWinner ? "kept" : hasPhoto ? "cleared" : "no-photo";
      if (decision === "cleared") toClear.push(s.vendor);

      console.log(
        `      ${isWinner ? "✅ KEEP " : hasPhoto ? "🧹 CLEAR" : "   —    "} ` +
        `${s.vendor.vendor_name.padEnd(34)} score=${s.score.toFixed(2)}` +
        `${s.distinctive.length ? ` [${s.matched.join(",") || "no distinctive match"}]` : " [no distinctive tokens]"}`
      );

      report.push({
        id: s.vendor.id,
        vendor_name: s.vendor.vendor_name,
        video: videoId(url),
        caption: caption || null,
        score: Number(s.score.toFixed(3)),
        matched_tokens: s.matched,
        shared_with: group.length - 1,
        decision,
      });
    }
    if (!decidedWinner) {
      console.log(`      ↳ caption names no single vendor${tied ? " (tie)" : ""} — clearing the whole group`);
    }
    console.log("");
  }

  // Unique-video vendors are never cleared; score them for the report only so
  // weak ones can be reviewed manually later.
  const uniqueVendors = [...byVideo.values()].filter((g) => g.length === 1).map((g) => g[0]);
  console.log(`ℹ️   ${uniqueVendors.length} vendors have their own video — photos kept, not scored over the network (no ambiguity to resolve)\n`);

  if (!APPLY) {
    console.log(`🔍  DRY RUN — would clear ${toClear.length} photo(s). Re-run with --apply to write.`);
  } else {
    let cleared = 0, failed = 0;
    for (const v of toClear) {
      try {
        const { error: updateErr } = await supabase
          .from("vendors")
          .update({ storefront_image_url: null })
          .eq("id", v.id);
        if (updateErr) throw new Error(updateErr.message);

        // Storage paths are per-vendor (vendors/{id}/storefront-*), so removing
        // one vendor's object cannot affect another's even when the bytes are
        // byte-identical across a shared-video group.
        const objectPath = storagePathFromUrl(v.storefront_image_url);
        if (objectPath) await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);

        cleared++;
      } catch (err) {
        console.log(`❌  ${v.vendor_name}: ${err.message}`);
        failed++;
      }
    }
    console.log(`✅  Cleared ${cleared} photo(s)${failed ? ` | ${failed} failed` : ""}`);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    applied: APPLY,
    totals: {
      vendors: vendors.length,
      distinct_videos: byVideo.size,
      shared_groups: sharedGroups.length,
      cleared: toClear.length,
    },
    vendors: report,
  }, null, 2));
  console.log(`📝  Report written to ${REPORT_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
