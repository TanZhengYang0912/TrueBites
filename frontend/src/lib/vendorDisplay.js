// Shared display helpers for vendor cards, the detail modal, and trip-panel
// stops. Category keys are derived from cuisine_types first so discovery filters
// use the database contract instead of a collection of visual guesses.
import { categoryPhoto } from "./categoryPhotos.js";
import { operatingStatus } from "./operatingHours.js";
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
// Shared `object-position` for every vendor photo shown in the card-hover and
// detail-modal carousels (VendorCard, VendorDetailModal) — a single exported
// constant so the two surfaces can't drift apart, which matters here: the
// same photo has to keep a visually consistent crop when a card is expanded
// into the detail view.
//
// Nearly every vendor photo (TikTok video-frame covers and gallery frames
// alike) is a portrait 9:16/3:4 source shown inside a landscape box, so
// `object-fit: cover` discards more than half its height — object-position
// decides which half survives. Tuned empirically against real vendor photos
// (rendered at card size, compared side by side) rather than guessed:
//   - A tight top bias (previously 18%) frequently lands the crop right on
//     top of TikTok's caption/location-tag band creators burn into the top
//     of the frame, which then dominates the card instead of the food —
//     confirmed on several real photos where the caption text filled a
//     quarter of the visible image.
//   - Dead centre (50%) overcorrects the other way on wide table/stall
//     shots (buffet spreads, market stalls), cropping the dish off the top
//     of the frame while showing more of the counter/signage below.
//   - ~38% down the frame cleared the caption band on every sampled photo
//     while still keeping food that sits slightly above centre (the common
//     case for these video frames) in view.
export const FOOD_PHOTO_POSITION = "50% 38%";

// Returns the real cover photo, or `null` when this vendor has none yet.
// Deliberately does NOT fall back to a stand-in here — this is also what the
// admin console's "Edit Vendor" cover dropzone previews (via
// AdminVendorManagementPage.jsx's makeForm), and showing a fake preview there
// would make an admin think a real cover was already uploaded when it wasn't.
// The public-facing fallback lives in vendorGallery() below instead, which
// only ever feeds the customer-facing card/detail carousels.
// `storefront_image_url` is the real DB/API column; `imageUrl` is how the
// admin console's API mapper names it; `image_url` is kept as a last-resort
// legacy key in case anything else still produces it.
export function placeholderImage(vendor) {
  return vendor.storefront_image_url || vendor.imageUrl || vendor.image_url || null;
}

// Ordered image list for the card-hover / detail-modal carousels: the
// storefront cover always leads (the same photo `placeholderImage` returns
// when one exists, so the first frame never "pops" when a carousel mounts),
// followed by any admin-uploaded/fetched gallery photos in upload order.
// `gallery_image_urls` is the raw DB/API field name; `galleryUrls` is how the
// admin console's list mapper names it (see admin.js's item mapper) — both
// are accepted so this works from either data source without a prop-mapping
// step at the call site.
//
// Unlike placeholderImage() itself, a vendor with no real cover here gets a
// same-category stock dish photo (categoryPhotos.js) instead of `null` — a
// customer-facing card sitting permanently empty (no free discovery source
// ever found a usable photo for ~20 vendors, and there's no automated way to
// close that gap) was judged worse than a generic, same-category stand-in.
// This still never shows another SPECIFIC vendor's photo — that's the
// actually misleading case the rest of this codebase guards against — a
// same-category dish shot is a bounded, honest-enough placeholder, not a
// fabricated identity.
export function vendorGallery(vendor) {
  const cover = placeholderImage(vendor) || categoryPhoto(categoryOf(vendor));
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

// Cards and discovery filters deliberately share one parser and Malaysia-time
// evaluator, so the badge cannot claim "Open" while Open now hides the vendor.
export function hoursStatus(vendor, now = new Date()) {
  return operatingStatus(vendor, now);
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
