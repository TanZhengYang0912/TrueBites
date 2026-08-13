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
// Curated category placeholders remain the final fallback. The static manifest
// is checked first so the existing vendor UUIDs use the images shipped with this
// branch without requiring a database or API change.
const PLACEHOLDER_IMAGES = {
  nyonya: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=480&h=360&fit=crop",
    "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=480&h=360&fit=crop",
    "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=480&h=360&fit=crop",
  ],
  cafe: [
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=480&h=360&fit=crop",
    "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=480&h=360&fit=crop",
    "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=480&h=360&fit=crop",
  ],
  local: [
    "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=480&h=360&fit=crop",
    "https://images.unsplash.com/photo-1543353071-873f17a7a088?w=480&h=360&fit=crop",
    "https://images.unsplash.com/photo-1526318472351-c75fcf070305?w=480&h=360&fit=crop",
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=480&h=360&fit=crop",
  ],
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Deterministic (not random) so the same vendor always shows the same photo
// across renders/reloads. A real uploaded/fetched image always takes
// precedence; the Unsplash category pool is only a last-resort fallback for a
// vendor that has no storefront photo at all yet (e.g. brand new, not yet run
// through the photo-fetch scripts). `storefront_image_url` is the real DB/API
// column; `imageUrl` is how the admin console's API mapper names it;
// `image_url` is kept as a last-resort legacy key in case anything else still
// produces it.
export function placeholderImage(vendor) {
  const real = vendor.storefront_image_url || vendor.imageUrl || vendor.image_url;
  if (real) return real;
  const pool = PLACEHOLDER_IMAGES[categoryOf(vendor)] || PLACEHOLDER_IMAGES.local;
  return pool[hashStr(String(vendor.id)) % pool.length];
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

// "RM8-15 per person" / "RM10" -> "RM8" (first number found); no match -> null.
export function priceLabel(vendor) {
  const match = (vendor.price_range || "").match(/\d+/);
  return match ? `RM${match[0]}` : null;
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
