/**
 * Batch-fetch real storefront + food photos from Google Places and attach
 * them to vendors already in Supabase — no manual "find a photo for every
 * vendor" work needed.
 *
 * For each vendor: Places Text Search (biased to its lat/lng, same as
 * geocode.js's approach) finds the matching Place, then Place Details
 * returns up to 10 photo references. The first photo becomes the storefront
 * cover (storefront_image_url, unless one is already set — use --force to
 * replace it); the next few become gallery_image_urls, shown as the extra
 * "food photos" slides in the card-hover / detail-modal carousels.
 *
 * COST WARNING — Places Text Search + Place Details + Place Photo are billed,
 * metered API calls (see https://mapsplatform.google.com/pricing/). This
 * makes ~2 API calls per vendor plus one Photo download per image, so a full
 * 600-vendor run is on the order of ~1,200+ billed requests. Run a small
 * --limit first and check your Google Cloud budget/quota before a full run.
 * The Places API (New) or legacy Places API must be enabled for the project
 * behind GOOGLE_API_KEY, which today only has Geocoding + Directions enabled
 * for this repo (see backend/routes/map.js) — enable it in Cloud Console
 * first or this will fail every request with REQUEST_DENIED.
 *
 * Usage:
 *   node scripts/fetchVendorPhotos.js --yes                 # full run
 *   node scripts/fetchVendorPhotos.js --yes --limit=5        # dry-run a few
 *   node scripts/fetchVendorPhotos.js --yes --vendor-id=<id> # one vendor
 *   node scripts/fetchVendorPhotos.js --yes --force          # also replace
 *                                                             # existing photos
 *
 * Requirements:
 *   - backend/.env must have GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   - GOOGLE_API_KEY's project must have the Places API enabled + billing on
 *   - Supabase: gallery_image_urls jsonb column + "vendor-images" storage
 *     bucket (see the schema comment in routes/vendors.js)
 */

import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { STORAGE_BUCKET, MAX_GALLERY_IMAGES, storagePathFromUrl } from "../lib/vendorValidation.js";

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
const GALLERY_COUNT = Math.min(MAX_GALLERY_IMAGES, parseInt(opt("gallery-count", "3"), 10));
const DELAY_MS = 200; // stay well under Places' per-second quota
const LOG_PATH = path.resolve("scripts/fetch_vendor_photos_log.json");

const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

if (!GOOGLE_KEY) { console.error("❌  GOOGLE_API_KEY missing in .env"); process.exit(1); }

if (!CONFIRMED) {
  console.log(
    "This calls the billed Google Places API and writes real storage/DB\n" +
    "changes for every matching vendor. Re-run with --yes once you've read\n" +
    "the cost warning at the top of this file (and ideally tried --limit=5\n" +
    "first)."
  );
  process.exit(0);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const CONTENT_TYPE_EXT = { "image/jpeg": "jpg", "image/png": "png" };

// Find the Place matching this vendor, biased to its known coordinates so a
// generic name like "Kedai Kopi Aik Kee" doesn't resolve to the wrong branch.
async function findPlaceId(vendor) {
  const query = `${vendor.vendor_name}, ${vendor.address || "Melaka, Malaysia"}`;
  const params = new URLSearchParams({ query, key: GOOGLE_KEY });
  if (vendor.latitude != null && vendor.longitude != null) {
    params.set("location", `${vendor.latitude},${vendor.longitude}`);
    params.set("radius", "300"); // metres — tight bias, these are precise geocoded points
  }
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;
  return data.results[0].place_id;
}

// photo_reference[] for a place, most-relevant first (Google's own ordering).
async function getPhotoRefs(placeId) {
  const params = new URLSearchParams({ place_id: placeId, fields: "photos", key: GOOGLE_KEY });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK") return [];
  return (data.result?.photos || []).map((p) => p.photo_reference);
}

// Downloads one photo and uploads it straight into Supabase Storage — the
// Place Photo endpoint redirects to the actual image, so a plain fetch with
// redirect follow-through gets the bytes directly.
async function uploadPlacePhoto(vendorId, photoRef, kind) {
  const params = new URLSearchParams({ maxwidth: "1000", photo_reference: photoRef, key: GOOGLE_KEY });
  const url = `https://maps.googleapis.com/maps/api/place/photo?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo fetch failed: ${res.status}`);

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = CONTENT_TYPE_EXT[contentType] || "jpg";
  const buffer = Buffer.from(await res.arrayBuffer());

  const filePath = `vendors/${vendorId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return pub.publicUrl;
}

function loadLog() {
  if (fs.existsSync(LOG_PATH)) return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  return { done: [] };
}
function saveLog(log) { fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2)); }

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  let query = supabase
    .from("vendors")
    .select("id, vendor_name, address, latitude, longitude, storefront_image_url, gallery_image_urls");
  if (ONLY_VENDOR_ID) query = query.eq("id", ONLY_VENDOR_ID);
  const { data: vendors, error } = await query;
  if (error) { console.error("❌  failed to load vendors:", error.message); process.exit(1); }

  const log = loadLog();
  const doneSet = new Set(log.done);
  let pending = FORCE ? vendors : vendors.filter((v) => !doneSet.has(v.id));
  if (LIMIT) pending = pending.slice(0, LIMIT);

  console.log(`📄  ${vendors.length} vendors total | ${pending.length} to process this run`);

  let ok = 0, noMatch = 0, noPhotos = 0, failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const vendor = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] ${vendor.vendor_name} ... `);

    try {
      const placeId = await findPlaceId(vendor);
      if (!placeId) { console.log("⚠️  no Places match"); noMatch++; log.done.push(vendor.id); continue; }
      await sleep(DELAY_MS);

      const refs = await getPhotoRefs(placeId);
      if (!refs.length) { console.log("⚠️  matched but no photos"); noPhotos++; log.done.push(vendor.id); continue; }
      await sleep(DELAY_MS);

      // Remember what's being replaced so the old storage objects can be
      // cleaned up once the new ones are safely written — same
      // write-then-delete order as the /vendors/:id/image upload route
      // (routes/vendors.js) so a failed write never leaves a vendor with a
      // dangling storefront_image_url pointing at a deleted object.
      const oldCoverUrl = vendor.storefront_image_url;
      const oldGalleryUrls = Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [];

      let coverUrl = oldCoverUrl;
      let galleryUrls = [...oldGalleryUrls];
      let uploaded = 0;
      const replacingCover = !coverUrl || FORCE;
      const replacingGallery = FORCE;

      if (replacingCover) {
        coverUrl = await uploadPlacePhoto(vendor.id, refs[0], "storefront");
        uploaded++;
        await sleep(DELAY_MS);
      }

      if (replacingGallery) galleryUrls = []; // start clean so a re-run doesn't pile up duplicates
      const remaining = Math.max(0, GALLERY_COUNT - galleryUrls.length);
      for (const ref of refs.slice(1, 1 + remaining)) {
        galleryUrls.push(await uploadPlacePhoto(vendor.id, ref, "gallery"));
        uploaded++;
        await sleep(DELAY_MS);
      }

      const { error: updateErr } = await supabase
        .from("vendors")
        .update({ storefront_image_url: coverUrl, gallery_image_urls: galleryUrls })
        .eq("id", vendor.id);
      if (updateErr) throw new Error(updateErr.message);

      // Only now that the DB points at the new photos, remove whichever old
      // objects were actually superseded — avoids orphaned files piling up
      // in the bucket on every --force re-run.
      const stalePaths = [];
      if (replacingCover && oldCoverUrl && oldCoverUrl !== coverUrl) stalePaths.push(storagePathFromUrl(oldCoverUrl));
      if (replacingGallery) {
        for (const url of oldGalleryUrls) stalePaths.push(storagePathFromUrl(url));
      }
      const toRemove = stalePaths.filter(Boolean);
      if (toRemove.length) await supabase.storage.from(STORAGE_BUCKET).remove(toRemove);

      console.log(`✅  ${uploaded} photo(s) uploaded${toRemove.length ? `, ${toRemove.length} old file(s) cleaned up` : ""}`);
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
  console.log(`\n✅  Done — ok: ${ok} | no match: ${noMatch} | no photos: ${noPhotos} | failed: ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
