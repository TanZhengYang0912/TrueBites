// One representative food photo per cuisine category — the last-resort cover
// image for a vendor with no real storefront/gallery photo of its own (every
// free discovery source — Mapillary, Overpass, Wikimedia — came up empty).
// Sourced from Wikimedia Commons, same convention as lib/landingImages.js,
// so licensing/attribution stays consistent across the app.
//
// This is a deliberate, narrower exception to vendorDisplay.js's usual "never
// show a stand-in as if it were the real thing" rule: a same-category dish
// photo is a far smaller risk of misleading a visitor than another vendor's
// actual storefront (which is what the stricter rule exists to prevent), and
// the alternative — a permanently empty cover with no automated fix
// available — was judged worse for a vendor that may otherwise be perfectly
// real and open for business.
const COMMONS_FILE = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const commonsImage = (fileName, width = 800) => `${COMMONS_FILE}${encodeURIComponent(fileName)}?width=${width}`;

export const CATEGORY_PHOTOS = {
  local: commonsImage("Chicken rice balls in Melaka.jpg"),
  nyonya: commonsImage("Nyonya Laksa.jpg"),
  cafe: commonsImage("Akaka Cendol.jpg"),
  chinese: commonsImage("Dim sum.jpg"),
  western: commonsImage("Full English breakfast (cropped).jpg"),
  middle_eastern: commonsImage("Mezze platter.jpg"),
  korean: commonsImage("KOCIS Korean meal table (4553953910).jpg"),
};

export function categoryPhoto(categoryKey) {
  return CATEGORY_PHOTOS[categoryKey] || CATEGORY_PHOTOS.local;
}
