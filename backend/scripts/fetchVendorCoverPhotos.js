/**
 * Batch-fill COVER photos for vendors that currently have none —
 * storefront_image_url IS NULL — using Google Places Photos and Wikimedia
 * Commons (free, keyless), matching the providers the interactive "Find
 * Photos Automatically" admin panel now uses (see photoProviders/index.js).
 * Mapillary (street-level) and Overpass/OpenStreetMap are no longer used by
 * this script either — same project decision as the panel: Google Places'
 * verified name+location match beats a street-level pass-by or an OSM node
 * tag for coverage/accuracy, and this script is unsupervised so accuracy
 * matters even more here than in the admin-confirmed panel.
 *
 * SCOPE — deliberately does NOT touch the video-frame or TikTok-oEmbed
 * providers, even though they're registered in photoProviders/index.js for
 * the normal admin-driven discover flow. Every vendor this script targets
 * has no cover for a specific reason: verifyVendorPhotos.js already found
 * their only video is a shared "N best X in Melaka" listicle that can't be
 * confidently attributed to one specific shop, and cleared storefront_image_url
 * for exactly that reason (see scripts/vendor_photo_audit.json). Running
 * video-frame extraction here would just reintroduce that same misattribution
 * — so this script only ever calls findGooglePlacesCandidates/findWikimediaCandidates
 * directly, not the full discoverVendorPhotos() pipeline.
 *
 * AUTO-COMMIT SAFETY — this bypasses the normal admin manual-confirm step
 * (PhotoDiscoveryPanel), so it applies a stricter bar than the UI's own
 * NEEDS_CONFIRMATION_THRESHOLD (60):
 *
 *   - Google Places AND Wikimedia candidates need confidence >=
 *     AUTO_SUGGEST_THRESHOLD (85) AND at least 2 distinctive tokens in the
 *     vendor's own name. The distinctive-token bar was found by live-testing
 *     this exact pipeline: a vendor named just "Nyonya" hit Wikimedia's
 *     exact-substring-match branch (100% confidence) against an unrelated
 *     "Baba Nyonya Museum" photo, because the single word appears verbatim
 *     in both. A vendor name with only one distinctive word can't be trusted
 *     to identify one specific business without a human look — those go to
 *     the needs-review report too, regardless of confidence. Google Places
 *     gets the same bar for the same reason: "Find Place From Text" matches
 *     on name too, and a one-word vendor name is just as capable of latching
 *     onto the wrong nearby business as a Wikimedia title is.
 *
 * Everything that IS auto-committed still goes through the same storage +
 * DB write path as a manual admin commit (cover_photo_locked stays false,
 * so it can still be replaced later by a manual upload or a better match).
 *
 * Usage:
 *   node scripts/fetchVendorCoverPhotos.js --yes
 *   node scripts/fetchVendorCoverPhotos.js --yes --limit=10
 *   node scripts/fetchVendorCoverPhotos.js --yes --vendor-id=<id>
 *   node scripts/fetchVendorCoverPhotos.js --yes --force   # re-check vendors
 *     already marked "done" in a previous run too — e.g. after switching
 *     providers, so a past run's misses get a fresh try.
 *
 * Requirements: backend/.env must have SUPABASE_URL, SUPABASE_SERVICE_KEY,
 * and GOOGLE_API_KEY (Wikimedia needs no key at all; vendors are skipped —
 * not flagged — if GOOGLE_API_KEY is unset, same as the interactive panel).
 */

import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { findGooglePlacesCandidates } from "../lib/photoProviders/googlePlacesPhotoProvider.js";
import { findWikimediaCandidates } from "../lib/photoProviders/wikimediaProvider.js";
import { downloadAndStorePhoto } from "../lib/photoProviders/photoStorage.js";
import { captionMatchConfidence, AUTO_SUGGEST_THRESHOLD } from "../lib/photoMatching.js";

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
const MIN_DISTINCTIVE_TOKENS = 2; // see AUTO-COMMIT SAFETY above
const LOG_PATH = path.resolve("scripts/fetch_vendor_cover_photos_log.json");
const REVIEW_PATH = path.resolve("scripts/vendor_cover_needs_review.json");
const DELAY_MS = 500;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

if (!CONFIRMED) {
  console.log(
    "This picks the best Google Places/Wikimedia candidate for each cover-less\n" +
    "vendor and, for candidates that clear a strict auto-commit bar, writes\n" +
    "it as the cover photo automatically (no admin click) — real writes to\n" +
    "the shared vendor-images bucket + vendors table. Anything that doesn't\n" +
    "clear the bar is left alone and listed in a needs-review report instead.\n" +
    "Re-run with --yes once you're ready (ideally try --limit=5 first)."
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

// Reuses captionMatchConfidence purely to get at its GENERIC_CAPTION_TOKENS-
// aware tokenizer (not exported directly) — calling it with the vendor's own
// name on both sides always hits the exact-match branch, so `distinctive`
// comes back as exactly the vendor name's distinctive tokens.
function distinctiveTokenCount(vendorName) {
  return captionMatchConfidence(vendorName, vendorName).distinctive.length;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  let query = supabase
    .from("vendors")
    .select("id, vendor_name, latitude, longitude, cuisine_types, storefront_image_url");
  if (ONLY_VENDOR_ID) query = query.eq("id", ONLY_VENDOR_ID);
  const { data: vendors, error } = await query;
  if (error) { console.error("❌  failed to load vendors:", error.message); process.exit(1); }

  const eligible = vendors.filter((v) => !v.storefront_image_url);
  const log = loadLog();
  const doneSet = new Set(log.done);
  let pending = FORCE ? eligible : eligible.filter((v) => !doneSet.has(v.id));
  if (LIMIT) pending = pending.slice(0, LIMIT);

  console.log(`📄  ${vendors.length} vendors total | ${eligible.length} with no cover | ${pending.length} to process this run\n`);

  const needsReview = fs.existsSync(REVIEW_PATH) ? JSON.parse(fs.readFileSync(REVIEW_PATH, "utf8")) : [];
  let autoCommitted = 0, flaggedForReview = 0, noCandidates = 0;

  for (let i = 0; i < pending.length; i++) {
    const vendor = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] ${vendor.vendor_name} ... `);

    const [googleResult, wikimediaResult] = await Promise.allSettled([
      findGooglePlacesCandidates(vendor),
      findWikimediaCandidates(vendor),
    ]);
    const googleCandidates = googleResult.status === "fulfilled" ? googleResult.value : [];
    const wikimediaCandidates = wikimediaResult.status === "fulfilled" ? wikimediaResult.value : [];
    const allCandidates = [...googleCandidates, ...wikimediaCandidates].sort((a, b) => b.confidence - a.confidence);

    const nameTokenCount = distinctiveTokenCount(vendor.vendor_name);
    const autoEligible = [...googleCandidates, ...wikimediaCandidates]
      .filter((c) => c.confidence >= AUTO_SUGGEST_THRESHOLD && nameTokenCount >= MIN_DISTINCTIVE_TOKENS)
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (autoEligible) {
      try {
        // Same reasoning as routes/vendors.js's /photos/commit: Google
        // Places candidates carry a bare photo_reference (not a directly
        // fetchable URL) so the server-side key never reaches a candidate
        // sent to a browser — this script IS the server, so it rebuilds the
        // real URL here itself. Every other provider's photoRef is already
        // a direct URL.
        const downloadUrl = autoEligible.provider === "google_places_photo"
          ? `https://maps.googleapis.com/maps/api/place/photo?${new URLSearchParams({ maxwidth: "1600", photo_reference: autoEligible.photoRef, key: process.env.GOOGLE_API_KEY || "" })}`
          : autoEligible.photoRef;
        const stored = await downloadAndStorePhoto(vendor.id, downloadUrl, "storefront");
        const { error: updateErr } = await supabase
          .from("vendors")
          .update({
            storefront_image_url: stored.url,
            cover_photo_source: "external_api",
            cover_photo_provider: autoEligible.provider,
            cover_photo_confidence: autoEligible.confidence,
            cover_photo_locked: false,
          })
          .eq("id", vendor.id);
        if (updateErr) throw new Error(updateErr.message);
        console.log(`✅  auto-committed (${autoEligible.provider}, ${autoEligible.confidence}%)`);
        autoCommitted++;
        // Resolved — drop any stale needs-review entry from an earlier run
        // (matters under --force, where a vendor can go from "flagged" to
        // "auto-committed" once a re-run finds a stronger match).
        for (let j = needsReview.length - 1; j >= 0; j--) {
          if (needsReview[j].vendorId === vendor.id) needsReview.splice(j, 1);
        }
      } catch (err) {
        console.log(`❌  ${err.message}`);
      }
    } else if (allCandidates.length) {
      console.log(`⚠️  ${allCandidates.length} candidate(s) found, none auto-eligible — flagged for review`);
      flaggedForReview++;
      // Replace rather than duplicate — under --force this vendor may
      // already have an entry from an earlier run.
      const existingIdx = needsReview.findIndex((r) => r.vendorId === vendor.id);
      const entry = {
        vendorId: vendor.id,
        vendorName: vendor.vendor_name,
        candidates: allCandidates.map((c) => ({
          provider: c.provider,
          confidence: c.confidence,
          previewUrl: c.previewUrl,
          note: c.breakdown.note,
        })),
      };
      if (existingIdx === -1) needsReview.push(entry);
      else needsReview[existingIdx] = entry;
    } else {
      console.log("—  no candidates from either provider");
      noCandidates++;
    }

    if (!log.done.includes(vendor.id)) log.done.push(vendor.id);
    if ((i + 1) % 5 === 0) { saveLog(log); fs.writeFileSync(REVIEW_PATH, JSON.stringify(needsReview, null, 2)); }
    await sleep(DELAY_MS);
  }

  saveLog(log);
  fs.writeFileSync(REVIEW_PATH, JSON.stringify(needsReview, null, 2));
  console.log(`\n✅  Done — auto-committed: ${autoCommitted} | needs review: ${flaggedForReview} | no candidates: ${noCandidates}`);
  if (flaggedForReview) console.log(`   See ${REVIEW_PATH} — pick these via the admin panel's "Find Photos Automatically".`);
}

main().catch((err) => { console.error(err); process.exit(1); });
