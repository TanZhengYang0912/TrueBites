// Shared "download this candidate photo and persist it" step for every photo
// provider (TikTok oEmbed, Mapillary, Flickr, ...). Deliberately provider-
// agnostic: every provider's candidate.photoRef is just a fetchable image
// URL, so downloading and uploading it to Supabase Storage is identical work
// regardless of where the URL came from. Extracted here so the commit
// endpoint (routes/vendors.js) and the batch script
// (scripts/fetchVendorTiktokThumbnails.js) share one implementation instead
// of each re-implementing fetch+upload.
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "../vendorValidation.js";

const CONTENT_TYPE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Deferred until an admin (or a batch script) commits to one specific
// candidate — a discover/preview call never downloads bytes or costs storage,
// only this explicit step does.
export async function downloadAndStorePhoto(vendorId, sourceUrl, role = "storefront") {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`photo download failed: ${res.status}`);

  const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const ext = CONTENT_TYPE_EXT[contentType] || "jpg";
  const buffer = Buffer.from(await res.arrayBuffer());

  const filePath = `vendors/${vendorId}/${role}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return { url: pub.publicUrl, storagePath: filePath };
}
