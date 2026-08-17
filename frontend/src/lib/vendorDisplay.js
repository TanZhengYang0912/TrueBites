// Shared display helpers for vendor cards, the detail modal, and trip-panel
// stops. Category keys are derived from cuisine_types first so discovery filters
// use the database contract instead of a collection of visual guesses.
export const CATEGORY_FILTERS = [
  { key: "all", label: "All", values: null },
  { key: "local", label: "Malaysian / Local", values: ["Malaysian / Local"] },
  { key: "cafe", label: "Cafe / Dessert", values: ["Cafe / Dessert"] },
  { key: "nyonya", label: "Nyonya / Peranakan", values: ["Nyonya / Peranakan"] },
];

export const MORE_CATEGORY_OPTIONS = [
  { key: "western", label: "Western", values: ["Western"] },
  { key: "middle_eastern", label: "Middle Eastern", values: ["Middle Eastern"] },
  { key: "chinese", label: "Chinese", values: ["Chinese"] },
  { key: "korean", label: "Korean", values: ["Korean"] },
];

const CATEGORY_LABELS = {
  local: "Malaysian / Local",
  cafe: "Cafe / Dessert",
  nyonya: "Nyonya / Peranakan",
  western: "Western",
  middle_eastern: "Middle Eastern",
  chinese: "Chinese",
  korean: "Korean",
};

const CATEGORY_KEYS = new Map([
  ["Malaysian / Local", "local"],
  ["Cafe / Dessert", "cafe"],
  ["Nyonya / Peranakan", "nyonya"],
  ["Western", "western"],
  ["Middle Eastern", "middle_eastern"],
  ["Chinese", "chinese"],
  ["Korean", "korean"],
]);

const CATEGORY_KEYWORDS = {
  nyonya: ["nyonya", "peranakan", "nonya", "baba", "kuih", "heritage", "portuguese"],
  cafe: ["kopitiam", "kopi", "coffee", "cafe", "coff", "espresso", "latte", "bakery", "pastry", "toast", "cendol", "dessert", "cake"],
  local: ["satay", "hawker", "laksa", "char kway", "char koay", "nasi", "mee ", "rice", "roti", "rendang", "ayam", "ikan", "sotong", "prawn", "tom yam", "claypot", "wantan", "wonton", "traditional", "malay", "indian"],
};

export function categoryOf(vendor) {
  const databaseValues = String(vendor.cuisine_types || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const databaseKey = databaseValues.map((value) => CATEGORY_KEYS.get(value)).find(Boolean);
  if (databaseKey) return databaseKey;

  // Legacy fallback for incomplete records only. New filters never depend on it.
  const text = `${vendor.name || ""} ${vendor.cuisine_types || ""} ${vendor.signature_dishes || ""}`.toLowerCase();
  if (CATEGORY_KEYWORDS.nyonya.some((keyword) => text.includes(keyword))) return "nyonya";
  if (CATEGORY_KEYWORDS.cafe.some((keyword) => text.includes(keyword))) return "cafe";
  if (CATEGORY_KEYWORDS.local.some((keyword) => text.includes(keyword))) return "local";
  return "local";
}

export function categoryLabel(vendor) {
  return CATEGORY_LABELS[categoryOf(vendor)] || CATEGORY_LABELS.local;
}

export function categoryMatches(vendor, key) {
  if (key === "all") return true;
  const option = [...CATEGORY_FILTERS, ...MORE_CATEGORY_OPTIONS].find((item) => item.key === key);
  if (!option?.values) return false;
  const values = String(vendor.cuisine_types || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return option.values.some((value) => values.includes(value));
}

// ─── Vendor imagery ─────────────────────────────────────────────────────────────
// Returns the real cover photo, or `null` when this vendor has none yet.
// Deliberately does NOT fall back to a random stock/unrelated photo — showing
// an unrelated restaurant's photo as if it belonged to this vendor is worse
// than showing an honest "photo unavailable" state (see
// PhotoUnavailablePlaceholder.jsx, which every caller of vendorGallery()
// renders instead of an <img> whenever a slide is null). `storefront_image_url`
// is the real DB/API column; `imageUrl` is how the admin console's API mapper
// names it; `image_url` is kept as a last-resort legacy key in case anything
// else still produces it.
export function placeholderImage(vendor) {
  return vendor.storefront_image_url || vendor.imageUrl || vendor.image_url || null;
}

// Ordered image list for the card-hover / detail-modal carousels: the
// storefront cover always leads (same photo `placeholderImage` returns, so
// the first frame never "pops" when a carousel mounts), followed by any
// admin-uploaded/fetched gallery photos in upload order. `gallery_image_urls`
// is the raw DB/API field name; `galleryUrls` is how the admin console's list
// mapper names it (see admin.js's item mapper) — both are accepted so this
// works from either data source without a prop-mapping step at the call site.
export function vendorGallery(vendor) {
  const cover = placeholderImage(vendor);
  const images = [cover];

  const uploaded = Array.isArray(vendor.gallery_image_urls)
    ? vendor.gallery_image_urls
    : Array.isArray(vendor.galleryUrls)
      ? vendor.galleryUrls
      : [];
  for (const url of uploaded) {
    if (url && !images.includes(url)) images.push(url);
  }

  return images;
}

// Descriptive alt text per photo, e.g. "Storefront of Chacos Berlauk in
// Melaka" — replaces the previous bare `vendor.name` on every slide, which
// didn't distinguish the cover from later gallery photos and gave a screen
// reader no more information than the visible heading already provides.
// `index` is which slide within vendorGallery()'s ordering (0 = cover).
export function photoAltText(vendor, index = 0) {
  const place = vendor.city || vendor.address?.split(",")[0]?.trim() || "Melaka";
  const role = index === 0 ? "Storefront" : "Photo";
  return `${role} of ${vendor.vendor_name || vendor.name} in ${place}`;
}

// "RM8-15 per person" / "RM10" -> "RM8" (first number found); no match -> null.
export function priceLabel(vendor) {
  const match = (vendor.price_range || "").match(/\d+/);
  return match ? `RM${match[0]}` : null;
}

// "RM 8 - RM 15 per person" -> "RM8 – RM15"; "RM10 per person" -> "RM10"
// (single value when min/max are equal or only one number is present).
// Same number-extraction shape as the admin form's parsePriceRange, just
// rendered as an en-dash range instead of separate min/max form fields.
export function priceRangeLabel(vendor) {
  const str = vendor.price_range || "";
  const match = str.match(/RM\s*(\d+(?:\.\d+)?)\s*(?:-\s*(?:RM\s*)?(\d+(?:\.\d+)?))?/i);
  if (!match) return null;
  const min = match[1];
  const max = match[2];
  if (!max || Number(max) === Number(min)) return `RM${min}`;
  return `RM${min} – RM${max}`;
}

// Parses the "HH:MM AM/PM - HH:MM AM/PM" shape the admin form already
// enforces (see HOURS_RE in AdminVendorManagementPage.jsx) into an open/closed
// status plus a lowercase-formatted label ("6:00 am – 12:00 pm"). Older
// AI-scraped strings that don't match this shape ("3 - 4", "4 pm, 5.5 pm, 6
// pm") return null rather than guessing at a status — no badge is better than
// a wrong one.
const HOURS_RANGE_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;

function hoursToMinutes(hh, mm, period) {
  const h = Number.parseInt(hh, 10) % 12;
  return (h + (/pm/i.test(period) ? 12 : 0)) * 60 + Number.parseInt(mm, 10);
}

function formatClock(hh, mm, period) {
  return `${String(Number.parseInt(hh, 10)).padStart(2, "0")}:${mm} ${period.toLowerCase()}`;
}

export function hoursStatus(vendor) {
  const raw = vendor.operating_hours_raw || vendor.operating_hours;
  const match = HOURS_RANGE_RE.exec(raw || "");
  if (!match) return null;
  const [, oh, om, op, ch, cm, cp] = match;

  const openMin = hoursToMinutes(oh, om, op);
  const closeMin = hoursToMinutes(ch, cm, cp);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  // Closing time <= opening time means the window crosses midnight
  // (e.g. "4:00 pm - 12:00 am") — treat closing as happening "the next day".
  const isOpen = closeMin <= openMin
    ? nowMin >= openMin || nowMin < closeMin
    : nowMin >= openMin && nowMin < closeMin;

  return { isOpen, label: `${formatClock(oh, om, op)} – ${formatClock(ch, cm, cp)}` };
}

// Backend already computes this via haversine (see /restaurants/nearby).
export function walkLabel(vendor) {
  return vendor.roughEtaWalking != null ? `${vendor.roughEtaWalking} min` : null;
}

export function distanceLabel(vendor) {
  return vendor.distKm != null ? `${vendor.distKm} km` : null;
}

// "Nasi Lemak, Rendang" -> "Nasi Lemak" (first listed dish/cuisine for the tag pill)
export function primaryTag(vendor) {
  const first = (vendor.cuisine_types || vendor.signature_dishes || "").split(",")[0]?.trim();
  return first || null;
}

// "https://www.tiktok.com/@melaka.bites/video/123..." -> "@melaka.bites"
export function creatorHandle(vendor) {
  const url = vendor.source_video_url || "";
  const tiktok = url.match(/tiktok\.com\/@([\w.]+)/i);
  if (tiktok) return `@${tiktok[1]}`;
  if (vendor.source_platform) return `via ${vendor.source_platform}`;
  return null;
}
