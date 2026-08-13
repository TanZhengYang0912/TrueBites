// Shared vendor validation + storage helpers.
//
// Extracted from routes/vendors.js so the admin routes (routes/admin.js) and
// the public vendor routes validate identically instead of drifting apart.
// Kept dependency-free (no supabase import) — every export here is pure.

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

const HOURS_RE = /(\d{1,2}([:.]\d{2})?\s*(am|pm))|(\d{1,2}[:.]\d{2})|(24\s*hours?)/i;

export function validateVendor(body = {}) {
  const errors = {};
  const clean = {};

  const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

  // Business name
  const name = str(body.vendor_name);
  if (!name) errors.vendor_name = "Business name is required";
  else if (name.length < 2 || name.length > 120) errors.vendor_name = "Business name must be 2–120 characters";
  else clean.vendor_name = name;

  // Address
  const address = str(body.address);
  if (!address) errors.address = "Address is required";
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
  if (!hours) errors.operating_hours_raw = "Operating hours are required";
  else if (!HOURS_RE.test(hours)) errors.operating_hours_raw = 'Include a recognisable time, e.g. "Mon–Sun 9:00am – 10:00pm"';
  else clean.operating_hours_raw = hours;

  // Contact number (required, Malaysian format)
  const phone = str(body.phone);
  if (!phone) {
    errors.phone = "Contact number is required";
  } else if (!/^(\+?60|0)\d{8,10}$/.test(phone.replace(/[\s-]/g, ""))) {
    errors.phone = "Enter a valid Malaysian phone number, e.g. 06-283 1234 or +60 12-345 6789";
  } else {
    clean.phone = phone;
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

  // Free-text fields — passed through trimmed, no format rules.
  for (const k of ["state", "cuisine_types", "signature_dishes", "price_range", "operating_hours_raw"]) {
    if (has(k)) clean[k] = str(body[k]);
  }

  return { errors, clean };
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
