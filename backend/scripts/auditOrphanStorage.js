/**
 * Read-only audit: lists every object in the vendor-images storage bucket and
 * cross-references it against every vendor's storefront_image_url and
 * gallery_image_urls, to find objects nothing in the DB points to anymore
 * (e.g. left behind by a replaced cover, or a vendor row deleted without its
 * storage being cleaned up).
 *
 * NEVER deletes anything — this script has no .remove() call at all. It
 * regenerates scripts/orphan_storage_paths.json (a plain path list, same
 * shape as before, for anything that already expects it) and writes a fuller
 * scripts/orphan_storage_review.json with per-path context — which vendor id
 * the path belongs to, whether that vendor row still exists, and whether the
 * path was already flagged in the previous run — so a human can tell "old
 * photo replaced by a newer one" apart from "vendor was deleted, storage
 * wasn't" before anything is ever deleted.
 *
 * Usage:
 *   node scripts/auditOrphanStorage.js
 *
 * Requirements: backend/.env must have SUPABASE_URL, SUPABASE_SERVICE_KEY.
 */

import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { STORAGE_BUCKET, storagePathFromUrl } from "../lib/vendorValidation.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const LIST_PATH = path.resolve("scripts/orphan_storage_paths.json");
const REVIEW_PATH = path.resolve("scripts/orphan_storage_review.json");

// Storage "folders" are virtual (Supabase Storage has no real directories) —
// listing the bucket root returns one entry per vendor id, then each of
// those has to be listed individually to get the actual files inside it.
async function listAllObjects() {
  const paths = [];
  const { data: vendorFolders, error } = await supabase.storage.from(STORAGE_BUCKET).list("vendors", { limit: 10000 });
  if (error) throw new Error(`failed to list bucket root: ${error.message}`);

  for (const folder of vendorFolders || []) {
    if (!folder.name) continue;
    const prefix = `vendors/${folder.name}`;
    const { data: files, error: filesErr } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, { limit: 10000 });
    if (filesErr) { console.error(`  ⚠️  could not list ${prefix}: ${filesErr.message}`); continue; }
    for (const f of files || []) {
      if (!f.name) continue;
      paths.push(`${prefix}/${f.name}`);
    }
  }
  return paths;
}

async function main() {
  console.log("📄  Loading vendors…");
  const { data: vendors, error } = await supabase
    .from("vendors")
    .select("id, vendor_name, storefront_image_url, gallery_image_urls");
  if (error) { console.error("❌  failed to load vendors:", error.message); process.exit(1); }

  const referenced = new Set();
  for (const v of vendors) {
    const cover = storagePathFromUrl(v.storefront_image_url);
    if (cover) referenced.add(cover);
    for (const url of Array.isArray(v.gallery_image_urls) ? v.gallery_image_urls : []) {
      const p = storagePathFromUrl(url);
      if (p) referenced.add(p);
    }
  }
  console.log(`📄  ${vendors.length} vendors | ${referenced.size} storage paths currently referenced`);

  console.log("📄  Listing storage bucket (one call per vendor folder — this takes a bit)…");
  const allObjects = await listAllObjects();
  console.log(`📄  ${allObjects.length} objects found in "${STORAGE_BUCKET}"`);

  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const previousList = fs.existsSync(LIST_PATH) ? JSON.parse(fs.readFileSync(LIST_PATH, "utf8")) : [];
  const previousSet = new Set(Array.isArray(previousList) ? previousList : []);
  const currentObjectSet = new Set(allObjects);

  const orphaned = allObjects
    .filter((p) => !referenced.has(p))
    .map((p) => {
      const vendorId = p.split("/")[1] || null;
      const vendor = vendorId ? vendorById.get(vendorId) : null;
      return {
        path: p,
        vendorId,
        vendorExists: Boolean(vendor),
        vendorName: vendor ? vendor.vendor_name : null,
        wasInPreviousList: previousSet.has(p),
      };
    });

  const newSincePrevious = orphaned.filter((o) => !o.wasInPreviousList).length;
  const resolvedSincePrevious = [...previousSet].filter((p) => !currentObjectSet.has(p) || referenced.has(p)).length;

  fs.writeFileSync(LIST_PATH, JSON.stringify(orphaned.map((o) => o.path), null, 2));
  fs.writeFileSync(REVIEW_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    totals: {
      vendors: vendors.length,
      referenced_paths: referenced.size,
      storage_objects: allObjects.length,
      orphaned: orphaned.length,
      orphaned_under_deleted_vendor: orphaned.filter((o) => !o.vendorExists).length,
      orphaned_under_existing_vendor: orphaned.filter((o) => o.vendorExists).length,
      new_since_previous_list: newSincePrevious,
      resolved_since_previous_list: resolvedSincePrevious,
    },
    orphaned,
  }, null, 2));

  console.log(
    `\n✅  ${orphaned.length} orphaned object(s) — ` +
    `${orphaned.filter((o) => !o.vendorExists).length} under a deleted vendor, ` +
    `${orphaned.filter((o) => o.vendorExists).length} under a vendor that still exists ` +
    `(most likely an old photo that was since replaced).`
  );
  console.log(`   Nothing was deleted. Review scripts/${path.basename(REVIEW_PATH)} before deleting anything.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
