// Turns AI-extracted job data into a real vendor row — port of
// backend/services/supabase_client.py's REST calls, but reusing this
// codebase's OWN existing Node helpers instead of re-implementing raw
// Supabase/Storage REST calls from scratch: the shared `supabase` client
// (backend/supabase.js), the shared photo-download-and-store helper
// (lib/photoProviders/photoStorage.js), and the already-ported
// Ratcliff-Obershelp duplicate scorer (lib/vendorDuplicates.js).
import { supabase } from "../../supabase.js";
import { downloadAndStorePhoto } from "../photoProviders/photoStorage.js";
import { findDuplicatesFor } from "../vendorDuplicates.js";
import { normaliseOperatingHours, normaliseVendorHoursFields } from "../vendorValidation.js";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Prefers a full street address; falls back to city/state when the AI
// pipeline couldn't extract a precise one (common for roadside stalls that
// never get a formal address mentioned on video). Returns null if Google
// can't resolve the query at all — callers must handle that, not assume a
// draft vendor always gets coordinates.
export async function geocodeVendorAddress(vendorName, address, city, state) {
  const locationText = address?.trim() || [city, state].filter(Boolean).join(", ");
  if (!locationText) return null;

  const query = `${vendorName}, ${locationText}, Malaysia`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=MY&key=${GOOGLE_API_KEY}`;

  let data;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    data = await res.json();
  } catch {
    return null;
  }
  if (data.status !== "OK" || !data.results?.length) return null;

  const result = data.results[0];
  return {
    formatted_address: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    // Only trust "exact" when the AI actually had a street address to
    // geocode from — a city/state-only query resolves to a city centroid.
    precision: address?.trim() ? "exact" : "city_level",
  };
}

// Fuzzy-matches a candidate vendor_name/address/city/state against every
// existing vendor whose name loosely contains it, for the admin's
// duplicate-review gate before create-draft/save-to-database commits.
export async function findDuplicateVendors(vendorName, address = "", city = "", state = "") {
  if (!vendorName) return [];

  const safeName = vendorName.replace(/[^a-zA-Z0-9 ]+/g, " ").trim();
  let query = supabase.from("vendors").select("id,vendor_name,address,city,state,status,source_video_url").limit(1000);
  if (safeName) query = query.ilike("vendor_name", `%${safeName}%`);

  const { data: candidates, error } = await query;
  if (error || !candidates) return [];

  const location = [address, city, state].filter(Boolean).join(" ");
  // findDuplicatesFor only compares against `candidate.address` — fold
  // city/state into that field per-row so the comparison matches the
  // Python original's combined address+city+state location text.
  const withCombinedLocation = candidates.map((c) => ({
    ...c,
    address: [c.address, c.city, c.state].filter(Boolean).join(" "),
  }));

  return findDuplicatesFor({ vendor_name: vendorName, address: location }, withCombinedLocation);
}

// Insert-or-update keyed off vendor_name (NOT source_video_url — that field
// is deliberately non-unique, since one "Top 5 Nasi Ayam in Melaka"-style
// roundup video legitimately covers several distinct vendors). A
// vendor_name that already exists under a DIFFERENT source video is
// refused rather than silently overwritten — that's the one case where a
// porting mistake could corrupt real, possibly CSV-imported, vendor data.
export async function upsertAiVendor(row) {
  const safeInsertRow = normaliseVendorHoursFields(row);
  const { data: matches, error: findErr } = await supabase
    .from("vendors")
    .select("id, source_video_url")
    .eq("vendor_name", safeInsertRow.vendor_name);
  if (findErr) throw new Error(findErr.message);

  if (!matches?.length) {
    const { data, error } = await supabase.from("vendors").insert(safeInsertRow).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  const match = matches[0];
  if (match.source_video_url !== safeInsertRow.source_video_url) {
    throw new Error(
      `vendor_name '${safeInsertRow.vendor_name}' already exists from a different source (${match.source_video_url || "CSV import"}); refusing to overwrite`
    );
  }

  // A rerun that extracts no valid hours must not erase a value an admin
  // corrected after the first AI import.
  const safeUpdateRow = normaliseVendorHoursFields(row, { omitInvalid: true });
  const { data, error } = await supabase.from("vendors").update(safeUpdateRow).eq("id", match.id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// Port of _draft_vendor_row — maps extracted fields + geocoding into the
// exact vendors-table row shape create-draft/save-to-database insert.
export async function buildDraftVendorRow(job, extracted, summary) {
  const vendorName = extracted.vendor_name;
  if (!vendorName) throw new Error("Vendor name is required before creating a draft");

  const address = extracted.address || "";
  const city = extracted.city || "";
  const state = extracted.state || "";
  const geo = await geocodeVendorAddress(vendorName, address, city, state);
  const platform = /tiktok/i.test(job.url || "") ? "TikTok" : "YouTube";

  const operatingHours = normaliseOperatingHours(extracted.operating_hours_raw);
  return {
    vendor_name: vendorName,
    address: geo ? geo.formatted_address : address,
    city,
    state,
    latitude: geo ? geo.latitude : null,
    longitude: geo ? geo.longitude : null,
    location_precision: geo ? geo.precision : "unknown",
    cuisine_types: (extracted.cuisine_types || []).join(", "),
    signature_dishes: (extracted.signature_dishes || []).join(", "),
    price_range: extracted.price_range ?? null,
    sentiment_score: extracted.sentiment_score ?? null,
    ai_review_summary: summary,
    operating_hours_raw: operatingHours,
    operating_hours: operatingHours,
    source_video_url: job.url,
    source_platform: platform,
    status: "draft",
    last_updated: new Date().toISOString(),
  };
}

// Best-effort: re-hosts the video thumbnail yt-dlp already fetched as the
// vendor's cover photo, so an AI-created vendor shows a real photo instead
// of the category placeholder. Never overwrites an existing
// storefront_image_url — a manual admin upload always wins. Any failure
// here is logged and swallowed; a broken thumbnail must never fail vendor
// creation.
export async function attachAiThumbnail(vendorRow, thumbnailUrl) {
  if (!vendorRow?.id || !thumbnailUrl || vendorRow.storefront_image_url) return;
  try {
    const { url } = await downloadAndStorePhoto(vendorRow.id, thumbnailUrl, "storefront");
    await supabase.from("vendors").update({ storefront_image_url: url }).eq("id", vendorRow.id);
  } catch (err) {
    console.error(`failed to attach AI thumbnail for vendor ${vendorRow.id}:`, err.message);
  }
}
