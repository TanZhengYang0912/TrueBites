// Free, keyless, no-login fallback source — Wikimedia Commons' search API
// needs no registration at all (unlike Flickr, which now requires a paid
// Flickr Pro subscription to even create an API key — confirmed directly
// against Flickr's current signup flow, so it's not wired up as a provider).
//
// Per the project's own scope notes, Commons is a narrow fallback: it mostly
// documents notable/landmark places, not ordinary hawker stalls — tested
// against several real vendor names in this dataset and got zero results for
// anything not already locally famous (e.g. an actual Jonker Street stall).
// That's expected and fine; this provider just quietly returns nothing for
// the vendors it can't help with, the same as every other provider here.
//
// Commons image titles/descriptions read as descriptive captions ("Fried
// oyster and carrot cake stall at Jonker Street Night Market in Melaka,
// Malaysia"), not clean business names — so this reuses captionMatchConfidence
// (the same distinctive-token matching the TikTok provider uses for video
// captions) rather than computePhotoMatchConfidence's name+location formula.
// That formula also wouldn't work well here anyway: Commons results almost
// never carry usable coordinates or a business category, and without those
// its max achievable score is 50 (name only) — always below
// NEEDS_CONFIRMATION_THRESHOLD (60), so nothing would ever reach an admin.
import { captionMatchConfidence } from "../photoMatching.js";

const MAX_CANDIDATES = 3;
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

function stripHtml(value) {
  return value ? String(value).replace(/<[^>]*>/g, "").trim() : null;
}

export async function findWikimediaCandidates(vendor) {
  if (!vendor.vendor_name) return [];

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${vendor.vendor_name} Melaka Malaysia`,
    gsrnamespace: "6", // File namespace — actual media, not category/talk pages
    gsrlimit: String(MAX_CANDIDATES * 3),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1024",
    format: "json",
    origin: "*",
  });

  let payload;
  try {
    const res = await fetch(`${COMMONS_API}?${params}`);
    if (!res.ok) return []; // Commons down/rate-limited — fail quiet, never crash discovery
    payload = await res.json();
  } catch {
    return []; // network failure
  }

  const pages = Object.values(payload?.query?.pages || {});
  if (!pages.length) return [];

  return pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) return null;

      // "File:Fried oyster and carrot cake stall at Jonker Street....jpg" ->
      // "Fried oyster and carrot cake stall at Jonker Street..." — the title
      // is already the most caption-like text Commons gives us; the image's
      // own description (when present) is appended for a slightly larger
      // pool of words to match the vendor's distinctive tokens against.
      const title = page.title.replace(/^File:/, "").replace(/\.[a-z]{3,4}$/i, "");
      const description = stripHtml(info.extmetadata?.ImageDescription?.value);
      const caption = description ? `${title} ${description}` : title;

      const { confidence, matched } = captionMatchConfidence(vendor.vendor_name, caption);
      const artist = stripHtml(info.extmetadata?.Artist?.value);
      const license = info.extmetadata?.LicenseShortName?.value || "unknown license";
      const attribution = artist ? `Photo by ${artist} — ${license}, via Wikimedia Commons` : `${license}, via Wikimedia Commons`;

      return {
        provider: "wikimedia",
        placeName: title,
        category: null,
        confidence,
        breakdown: {
          matchedPlaceName: matched.length ? title : null,
          distanceMeters: null,
          nameSimilarityPct: confidence,
          category: null,
          categoryMatch: null,
          // Always carries a verify caveat, even on a full-name text match:
          // unlike the TikTok/video-frame providers (whose source is the
          // vendor's own uploaded video), Wikimedia is a public third-party
          // photo database — a name match only means the *title* mentions
          // this vendor's name, not that the photo depicts this specific
          // storefront. Found live: searching a vendor named just "Nyonya"
          // matched an unrelated "Baba Nyonya Museum" photo at 100%
          // confidence, since the single word appears verbatim in both.
          note: matched.length
            ? `Wikimedia Commons photo titled "${title}" (matched: ${matched.join(", ")}) — please verify this is actually this vendor before using it (${attribution})`
            : `Wikimedia Commons photo — title doesn't clearly name this vendor, please verify (${attribution})`,
          attribution,
          license,
        },
        previewUrl: info.thumburl,
        photoRef: info.thumburl,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}
