// Confidence scoring for "is this external candidate photo actually a photo
// of this vendor?" — used by the /photos/discover endpoint before any
// candidate is shown to an admin. Distinct from vendorDuplicates.js's scorer,
// which answers a different question (is this a duplicate DB row); this one
// reuses its name-similarity primitives rather than re-implementing them.
import { normalizeMatchText, sequenceRatio } from "./vendorDuplicates.js";
import { haversine } from "../haversine.js";

// Below this, a candidate is dropped before it ever reaches the admin UI —
// not confident enough to be worth showing at all.
//
// Deliberately low (was 60 — required near-certain identity match). Product
// direction: for the interactive "Find Photos Automatically" panel, an admin
// reviews and hand-picks every candidate anyway, so LOCATION relevance
// matters more than a confident identity match — a real nearby storefront/
// street photo is worth showing even when the system can't confirm it's
// THIS exact vendor, rather than showing nothing. This constant only gates
// what reaches that admin-reviewed panel; the batch scripts
// (fetchVendorCoverPhotos.js) that auto-commit a photo with no human look
// use their own separate, much stricter AUTO_SUGGEST_THRESHOLD-based bar and
// are untouched by this value.
export const NEEDS_CONFIRMATION_THRESHOLD = 20;
// At/above this, the UI may present the candidate as a safe one-click pick;
// between the two thresholds it's still shown, just labelled "possible match".
export const AUTO_SUGGEST_THRESHOLD = 85;

// Linear decay: a match right on top of the vendor's coordinates scores 100%
// on distance; anything DISTANCE_DECAY_METERS away or further scores 0%.
// Melaka's old-town shoplots sit a few metres apart, so this is deliberately
// tight — a "match" 500m away is very unlikely to be the same small stall.
const DISTANCE_DECAY_METERS = 500;

export function distanceToScore(distanceMeters) {
  if (distanceMeters == null || Number.isNaN(distanceMeters)) return 0;
  return Math.max(0, 1 - distanceMeters / DISTANCE_DECAY_METERS);
}

export function nameSimilarityScore(vendorName, candidateName) {
  return sequenceRatio(normalizeMatchText(vendorName), normalizeMatchText(candidateName));
}

// Keyword overlap between the vendor's own cuisine_types text and whatever
// category/type string a provider returns for its candidate. Deliberately
// coarse (no external taxonomy dependency) — 1 for a clear keyword hit, 0.5
// for "food-related but unspecific", 0 otherwise.
const FOOD_CATEGORY_KEYWORDS = [
  "restaurant", "cafe", "coffee", "bakery", "food", "diner", "eatery",
  "hawker", "stall", "kopitiam", "bistro",
];

export function categoryMatchScore(vendorCuisineTypes, candidateCategory) {
  if (!candidateCategory) return 0;
  const category = String(candidateCategory).toLowerCase();
  // Word-overlap, not substring containment: cuisine_types ("Malaysian /
  // Local") is usually longer than a provider's category ("restaurant"), so
  // a one-directional `category.includes(cuisine)` check can never fire —
  // compare individual words instead.
  const cuisineWords = String(vendorCuisineTypes || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (cuisineWords.some((word) => category.includes(word))) return 1;
  if (FOOD_CATEGORY_KEYWORDS.some((kw) => category.includes(kw))) return 0.5;
  return 0;
}

// `candidate` shape is provider-agnostic: { placeName, latitude, longitude,
// category }. `vendor` is a row from the vendors table (needs vendor_name,
// address/latitude/longitude, cuisine_types).
// Generic Malay/Melaka food + venue words that appear in almost every TikTok
// caption. Scoring on these would be actively harmful: the caption "5 nasi
// ayam terbaik di melaka" contains "nasi" and "ayam", so a naive token
// overlap would score "Nasi Ayam Liza" at 2/3 and let it win a group whose
// caption names nobody. Only tokens OUTSIDE this list count toward a match.
// (Originally lived in scripts/verifyVendorPhotos.js — moved here so the
// on-demand discovery endpoint and the batch audit script share one
// implementation instead of drifting apart.)
const GENERIC_CAPTION_TOKENS = new Set([
  "nasi", "ayam", "mee", "mi", "laksa", "roti", "ikan", "bakar", "cendol",
  "satay", "sate", "kopi", "kedai", "restoran", "restaurant", "cafe", "kafe",
  "warung", "gerai", "medan", "selera", "makan", "makanan", "melaka", "malacca",
  "best", "terbaik", "sedap", "murah", "viral", "di", "part", "food", "halal",
  "shop", "stall", "the", "dan", "and",
]);

function distinctiveTokens(name) {
  return normalizeMatchText(name)
    .split(" ")
    .filter(Boolean)
    .filter((t) => !GENERIC_CAPTION_TOKENS.has(t) && !/^\d+$/.test(t));
}

// How confidently does `caption` (a TikTok video's title/caption) name
// `vendorName`? 1.0 = the whole normalised name appears verbatim; otherwise
// the fraction of the vendor's DISTINCTIVE tokens present in the caption; 0
// when there's nothing distinctive to match on (a name made entirely of
// generic words identifies nothing and must never "win").
export function captionMatchConfidence(vendorName, caption) {
  const name = normalizeMatchText(vendorName);
  const text = normalizeMatchText(caption);
  if (!name || !text) return { confidence: 0, matched: [], distinctive: [] };

  const distinctive = distinctiveTokens(vendorName);
  if (text.includes(name) && name.length >= 4) {
    return { confidence: 100, matched: distinctive, distinctive };
  }
  if (!distinctive.length) return { confidence: 0, matched: [], distinctive };

  const captionTokens = new Set(text.split(" ").filter(Boolean));
  const matched = distinctive.filter((t) => captionTokens.has(t));
  return { confidence: Math.round((matched.length / distinctive.length) * 100), matched, distinctive };
}

export function computePhotoMatchConfidence({ vendor, candidate }) {
  const nameSim = nameSimilarityScore(vendor.vendor_name, candidate.placeName);

  let distanceMeters = null;
  let distanceScore = 0;
  if (
    vendor.latitude != null && vendor.longitude != null &&
    candidate.latitude != null && candidate.longitude != null
  ) {
    distanceMeters = Math.round(
      haversine(vendor.latitude, vendor.longitude, candidate.latitude, candidate.longitude) * 1000
    );
    distanceScore = distanceToScore(distanceMeters);
  }

  const categoryScore = categoryMatchScore(vendor.cuisine_types, candidate.category);

  const confidence = Math.round(nameSim * 50 + distanceScore * 35 + categoryScore * 15);

  return {
    confidence,
    breakdown: {
      matchedPlaceName: candidate.placeName || null,
      distanceMeters,
      nameSimilarityPct: Math.round(nameSim * 100),
      category: candidate.category || null,
      categoryMatch: categoryScore > 0,
    },
  };
}
