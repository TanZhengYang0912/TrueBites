// Shared vendor validation + storage helpers.
//
// Extracted from routes/vendors.js so the admin routes (routes/admin.js) and
// the public vendor routes validate identically instead of drifting apart.
// Kept dependency-free (no supabase import) — every export here is pure.

import { isMalaccaLocation } from "./suggestionValidation.js";

export const STORAGE_BUCKET = "vendor-images";

// Gallery photos (food/interior shots shown after the storefront cover in the
// card/detail carousels) are capped so one vendor can't blow up page weight
// or storage cost — 8 is plenty for a hover/autoplay carousel.
export const MAX_GALLERY_IMAGES = 8;

// Source of truth for the vendor status vocabulary — kept to exactly these
// three so every vendor is always in a well-defined state: newly-created
// vendors start as "draft", an admin promotes them to "active" (which is the
// only status shown on the public site), or "suspended" pulls them back down.
export const VENDOR_STATUSES = ["draft", "active", "suspended"];

export const MELAKA_BOUNDS = { latMin: 1.8, latMax: 2.6, lngMin: 101.8, lngMax: 102.8 };

// Keep this in step with frontend/lib/operatingHours.js: anything accepted
// here must be parseable by the public cards and discovery filters. Requiring
// a complete time range prevents AI-extracted promotion dates such as
// "18 - 27" from masquerading as operating hours.
const TWELVE_HOUR_RANGE_RE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i;
const TWENTY_FOUR_HOUR_RANGE_RE = /(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)(?:[^\d]|$)/;

export function normaliseOperatingHours(value) {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!text) return null;
  if (/\b24\s*hours?\b/i.test(text)) return text;

  const twelveHour = TWELVE_HOUR_RANGE_RE.exec(text);
  if (twelveHour) {
    const validPart = (hour, minute = "00") => {
      const numericHour = Number(hour);
      const numericMinute = Number(minute);
      return numericHour >= 1 && numericHour <= 12 && numericMinute >= 0 && numericMinute <= 59;
    };
    if (validPart(twelveHour[1], twelveHour[2]) && validPart(twelveHour[4], twelveHour[5])) return text;
  }

  return TWENTY_FOUR_HOUR_RANGE_RE.test(text) ? text : null;
}

// Apply at database write boundaries as a final defence for import/AI flows
// that do not pass through the HTTP request validators. The legacy and current
// columns intentionally stay identical so either public-reader path behaves
// consistently.
export function normaliseVendorHoursFields(row = {}, { omitInvalid = false } = {}) {
  const hours = normaliseOperatingHours(row.operating_hours_raw)
    || normaliseOperatingHours(row.operating_hours);
  const normalised = { ...row };
  if (!hours && omitInvalid) {
    delete normalised.operating_hours_raw;
    delete normalised.operating_hours;
    return normalised;
  }
  return { ...normalised, operating_hours_raw: hours, operating_hours: hours };
}

export function validateVendor(body = {}) {
  const errors = {};
  const clean = {};

  const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

  // Business name
  const name = str(body.vendor_name);
  if (!name) errors.vendor_name = "Business name is required";
  else if (name.length < 2 || name.length > 120) errors.vendor_name = "Business name must be 2–120 characters";
  else clean.vendor_name = name;

  // Address — the whole platform is Melaka-only (see MELAKA_BOUNDS below,
  // and the "Melaka Tourism" tagline in admin settings), so an address that
  // doesn't even mention Melaka/Malacca is almost certainly the wrong place,
  // regardless of what coordinates end up picked for it.
  const address = str(body.address);
  if (!address) errors.address = "Address is required";
  else if (!isMalaccaLocation(address)) errors.address = "Address must be in Melaka (Malacca)";
  else clean.address = address;

  // Coordinates
  const lat = parseFloat(body.latitude);
  const lng = parseFloat(body.longitude);
  if (body.latitude == null || body.latitude === "" || Number.isNaN(lat)) {
    errors.latitude = "Latitude is required and must be a number";
  } else if (lat < -90 || lat > 90) {
    errors.latitude = "Latitude must be between -90 and 90";
  } else if (lat < MELAKA_BOUNDS.latMin || lat > MELAKA_BOUNDS.latMax) {
    errors.latitude = `Latitude looks outside Melaka (expected ${MELAKA_BOUNDS.latMin}–${MELAKA_BOUNDS.latMax})`;
  } else {
    clean.latitude = lat;
  }
  if (body.longitude == null || body.longitude === "" || Number.isNaN(lng)) {
    errors.longitude = "Longitude is required and must be a number";
  } else if (lng < -180 || lng > 180) {
    errors.longitude = "Longitude must be between -180 and 180";
  } else if (lng < MELAKA_BOUNDS.lngMin || lng > MELAKA_BOUNDS.lngMax) {
    errors.longitude = `Longitude looks outside Melaka (expected ${MELAKA_BOUNDS.lngMin}–${MELAKA_BOUNDS.lngMax})`;
  } else {
    clean.longitude = lng;
  }
  if (clean.latitude != null && clean.longitude != null) {
    clean.location = `SRID=4326;POINT(${clean.longitude} ${clean.latitude})`;
    clean.location_precision = "exact";
  }

  // Cuisine categories
  const cuisineRaw = Array.isArray(body.cuisine_types)
    ? body.cuisine_types.join(", ")
    : str(body.cuisine_types);
  if (!cuisineRaw) errors.cuisine_types = "At least one cuisine type is required";
  else clean.cuisine_types = cuisineRaw;

  // Operating hours
  const hours = str(body.operating_hours_raw);
  const normalisedHours = normaliseOperatingHours(hours);
  if (!hours) errors.operating_hours_raw = "Operating hours are required";
  else if (!normalisedHours) errors.operating_hours_raw = 'Include a recognisable time range, e.g. "Mon–Sun 9:00am – 10:00pm"';
  else clean.operating_hours_raw = normalisedHours;

  // Contact number — optional (not every stall has one to publish), but
  // whatever's entered must actually look like a Malaysian number.
  const phone = str(body.phone);
  if (phone && !/^(\+?60|0)\d{8,10}$/.test(phone.replace(/[\s-]/g, ""))) {
    errors.phone = "Enter a valid Malaysian phone number, e.g. 06-283 1234 or +60 12-345 6789";
  } else {
    clean.phone = phone || null;
  }

  // Visibility status
  const status = str(body.status).toLowerCase() || "draft";
  if (!VENDOR_STATUSES.includes(status)) {
    errors.status = `Status must be one of: ${VENDOR_STATUSES.join(", ")}`;
  } else {
    clean.status = status;
  }

  // Remaining fields
  clean.state = str(body.state) || "Melaka";
  const priceRange = str(body.price_range);
  if (!priceRange) errors.price_range = "Price range is required";
  else clean.price_range = priceRange;
  const dishes = str(body.signature_dishes);
  if (!dishes) errors.signature_dishes = "Signature dishes are required";
  else clean.signature_dishes = dishes;

  // Optional — lets an admin attach the vendor's own TikTok video (free,
  // accurate photo source via the oEmbed-based discovery panel) even for a
  // vendor that wasn't originally scraped from one.
  const videoUrl = str(body.source_video_url);
  if (videoUrl) {
    if (!/tiktok\.com/i.test(videoUrl)) errors.source_video_url = "Must be a tiktok.com video link";
    else clean.source_video_url = videoUrl;
  }

  return { errors, clean };
}

// Partial validation for PATCH updates: only validates the fields actually
// present in the body (a value of undefined means "leave unchanged"), so an
// inline status-only patch and a full edit both work. Returns { errors, clean }
// where `clean` holds normalised values for just the provided fields.
export function validateVendorPatch(body = {}) {
  const errors = {};
  const clean = {};
  const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
  const has = (k) => body[k] !== undefined && body[k] !== null;

  if (has("vendor_name")) {
    const name = str(body.vendor_name);
    if (name.length < 2 || name.length > 120) errors.vendor_name = "Business name must be 2–120 characters";
    else clean.vendor_name = name;
  }

  if (has("address")) {
    const address = str(body.address);
    if (!address) errors.address = "Address is required";
    else if (!isMalaccaLocation(address)) errors.address = "Address must be in Melaka (Malacca)";
    else clean.address = address;
  }

  if (has("latitude") && body.latitude !== "") {
    const lat = parseFloat(body.latitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) errors.latitude = "Latitude must be a number between -90 and 90";
    else if (lat < MELAKA_BOUNDS.latMin || lat > MELAKA_BOUNDS.latMax) {
      errors.latitude = `Latitude looks outside Melaka (expected ${MELAKA_BOUNDS.latMin}–${MELAKA_BOUNDS.latMax})`;
    } else clean.latitude = lat;
  }
  if (has("longitude") && body.longitude !== "") {
    const lng = parseFloat(body.longitude);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) errors.longitude = "Longitude must be a number between -180 and 180";
    else if (lng < MELAKA_BOUNDS.lngMin || lng > MELAKA_BOUNDS.lngMax) {
      errors.longitude = `Longitude looks outside Melaka (expected ${MELAKA_BOUNDS.lngMin}–${MELAKA_BOUNDS.lngMax})`;
    } else clean.longitude = lng;
  }
  // Keep the PostGIS point in sync when both coords were provided and valid.
  if (clean.latitude != null && clean.longitude != null) {
    clean.location = `SRID=4326;POINT(${clean.longitude} ${clean.latitude})`;
    clean.location_precision = "exact";
  }

  if (has("phone")) {
    const phone = str(body.phone);
    if (phone && !/^(\+?60|0)\d{8,10}$/.test(phone.replace(/[\s-]/g, ""))) {
      errors.phone = "Enter a valid Malaysian phone number, e.g. 06-283 1234 or +60 12-345 6789";
    } else clean.phone = phone || null;
  }

  if (has("status")) {
    const status = str(body.status).toLowerCase();
    if (!VENDOR_STATUSES.includes(status)) errors.status = `Status must be one of: ${VENDOR_STATUSES.join(", ")}`;
    else clean.status = status;
  }

  if (has("operating_hours_raw")) {
    const hours = str(body.operating_hours_raw);
    const normalisedHours = normaliseOperatingHours(hours);
    if (!hours) errors.operating_hours_raw = "Operating hours are required";
    else if (!normalisedHours) errors.operating_hours_raw = 'Include a recognisable time range, e.g. "Mon–Sun 9:00am – 10:00pm"';
    else clean.operating_hours_raw = normalisedHours;
  }

  // Remaining free-text fields — passed through trimmed, no format rules.
  for (const k of ["state", "cuisine_types", "signature_dishes", "price_range"]) {
    if (has(k)) clean[k] = str(body[k]);
  }

  // storefront_image_url/cover_photo_locked: not part of the normal Edit
  // Vendor form (those go through the dedicated /vendors/:id/image and
  // /photos/commit routes) — accepted here only so the admin console's
  // Cancel-edit flow can restore a cover that "Find Photos Automatically"
  // committed mid-session back to its pre-edit value. `null` explicitly
  // clears it (a vendor with no cover yet).
  if (body.storefront_image_url !== undefined) {
    clean.storefront_image_url = body.storefront_image_url === null ? null : str(body.storefront_image_url) || null;
  }
  if (body.cover_photo_locked !== undefined) {
    clean.cover_photo_locked = Boolean(body.cover_photo_locked);
  }

  // Optional — see the matching comment in validateVendor. An empty string
  // explicitly clears it (unlike the other has() fields, `null`/undefined
  // just means "not included in this patch").
  if (body.source_video_url !== undefined) {
    const videoUrl = str(body.source_video_url);
    if (videoUrl && !/tiktok\.com/i.test(videoUrl)) errors.source_video_url = "Must be a tiktok.com video link";
    else clean.source_video_url = videoUrl || null;
  }

  return { errors, clean };
}

// Fields required for a vendor to be genuinely useful/complete once public —
// used to gate status -> "active" from every code path that can set it
// (admin quick-approve, bulk-approve, full Edit Vendor save, and the AI
// suggestion "Publish" action). Without this, a vendor missing e.g.
// coordinates could read "Active" in the admin console forever while
// GET /restaurants/nearby (map.js) silently drops it from the public map —
// an "active" that lies about actually being visible. Takes a DB-shaped
// vendor row (numbers already numbers, not the raw string form
// validateVendor takes from a request body) and returns a list of
// human-readable missing/invalid field names, empty when the vendor is
// ready to publish.
export function vendorActivationIssues(vendor = {}) {
  const issues = [];
  const blank = (v) => v == null || String(v).trim() === "";

  if (blank(vendor.vendor_name)) issues.push("business name");
  if (blank(vendor.address)) issues.push("address");

  // Number(null) is 0 (a "finite" number) — check for null/"" explicitly
  // first so a genuinely missing coordinate is reported as missing, not
  // misreported as "0,0, which happens to be outside Melaka".
  const lat = blank(vendor.latitude) ? NaN : Number(vendor.latitude);
  const lng = blank(vendor.longitude) ? NaN : Number(vendor.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    issues.push("map coordinates");
  } else if (lat < MELAKA_BOUNDS.latMin || lat > MELAKA_BOUNDS.latMax || lng < MELAKA_BOUNDS.lngMin || lng > MELAKA_BOUNDS.lngMax) {
    issues.push("map coordinates (outside Melaka)");
  }

  if (blank(vendor.cuisine_types)) issues.push("category");
  if (!normaliseOperatingHours(vendor.operating_hours_raw) && !normaliseOperatingHours(vendor.operating_hours)) {
    issues.push("operating hours");
  }
  // Phone is optional — not every stall has a published number, and that
  // alone shouldn't keep an otherwise-complete listing stuck in Draft.
  if (blank(vendor.price_range)) issues.push("price range");
  if (blank(vendor.signature_dishes)) issues.push("signature dishes");
  // A vendor with no cover photo reads as a broken/empty listing on the
  // public site — block activation the same as a missing name/address,
  // rather than letting an admin publish a blank card and forget to circle
  // back. Use "Find Photos Automatically" or a manual upload to clear this.
  if (blank(vendor.storefront_image_url)) issues.push("cover photo");

  return issues;
}

// Turns a public storage URL back into the object path inside STORAGE_BUCKET
// (so it can be passed to storage.remove). Returns null when the URL isn't a
// public object URL for this bucket.
export function storagePathFromUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
}
