// Shared "persist this candidate photo" step for every photo provider
// (TikTok oEmbed, Mapillary, ...) plus the AI frame-extraction pipeline.
// Deliberately provider-agnostic — extracted here so the commit endpoint
// (routes/vendors.js) and the batch scripts share one implementation
// instead of each re-implementing fetch+upload.
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "../vendorValidation.js";

const CONTENT_TYPE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function uploadBuffer(vendorId, buffer, contentType, role) {
  const ext = CONTENT_TYPE_EXT[contentType] || "jpg";
  const filePath = `vendors/${vendorId}/${role}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return { url: pub.publicUrl, storagePath: filePath };
}

// Deferred until an admin (or a batch script) commits to one specific
// candidate — a discover/preview call never downloads bytes or costs storage,
// only this explicit step does.
export async function downloadAndStorePhoto(vendorId, sourceUrl, role = "storefront") {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`photo download failed: ${res.status}`);

  const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadBuffer(vendorId, buffer, contentType, role);
}

// Same as downloadAndStorePhoto, but for a file already sitting on this
// machine's disk (e.g. a just-extracted video frame under backend/outputs/)
// — no HTTP round-trip needed since there's no separate service to fetch
// it from anymore.
export async function uploadLocalPhoto(vendorId, filePath, role = "gallery") {
  const buffer = await fs.readFile(filePath);
  return uploadBuffer(vendorId, buffer, "image/jpeg", role);
}
