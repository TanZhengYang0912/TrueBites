// Free-tier (registration-only, no billing) photo search — secondary source,
// complementing Mapillary's street-level exterior coverage with food/interior
// photos. Requires FLICKR_API_KEY (free from flickr.com/services/api, no
// credit card). Searches vendor name + coordinates together (per the
// project's "Vendor Name + Location" strategy), then scores results with the
// same name+distance+category formula photoMatching.js already uses for
// name-bearing candidates — unlike Mapillary, Flickr photos do have a title
// and (when geotagged) coordinates to check against the vendor.
import { computePhotoMatchConfidence } from "../photoMatching.js";

const FLICKR_KEY = process.env.FLICKR_API_KEY;
const SEARCH_RADIUS_KM = 0.3; // a couple of shoplots either side
const MAX_CANDIDATES = 3;
// Creative Commons / public-domain / US-Government license ids — excludes 0
// ("All Rights Reserved", i.e. not licensed for reuse at all). See
// https://www.flickr.com/services/api/flickr.photos.licenses.getInfo.html
const ALLOWED_LICENSES = "1,2,3,4,5,6,7,8,9,10";

export async function findFlickrCandidates(vendor) {
  if (!FLICKR_KEY) return [];
  if (!vendor.vendor_name) return [];

  const params = new URLSearchParams({
    method: "flickr.photos.search",
    api_key: FLICKR_KEY,
    text: vendor.vendor_name,
    license: ALLOWED_LICENSES,
    sort: "relevance",
    per_page: String(MAX_CANDIDATES * 2),
    format: "json",
    nojsoncallback: "1",
    extras: "url_m,geo,tags,owner_name,license",
  });
  if (vendor.latitude != null && vendor.longitude != null) {
    params.set("lat", String(vendor.latitude));
    params.set("lon", String(vendor.longitude));
    params.set("radius", String(SEARCH_RADIUS_KM));
    params.set("radius_units", "km");
  }

  let data;
  try {
    const res = await fetch(`https://www.flickr.com/services/rest/?${params}`);
    if (!res.ok) return []; // bad key, rate limit, etc — fail quiet, never crash discovery
    data = await res.json();
  } catch {
    return []; // network failure
  }

  const photos = data?.stat === "ok" ? data.photos?.photo || [] : [];
  if (!photos.length) return [];

  return photos
    .filter((p) => p.url_m) // some results have no medium size available
    .map((p) => {
      const candidateLat = p.latitude && Number(p.latitude) !== 0 ? Number(p.latitude) : null;
      const candidateLng = p.longitude && Number(p.longitude) !== 0 ? Number(p.longitude) : null;
      const { confidence, breakdown } = computePhotoMatchConfidence({
        vendor,
        candidate: { placeName: p.title, latitude: candidateLat, longitude: candidateLng, category: p.tags },
      });
      const attribution = p.ownername ? `Photo by ${p.ownername} on Flickr` : "Photo via Flickr";
      return {
        provider: "flickr",
        placeName: p.title || null,
        category: p.tags || null,
        confidence,
        breakdown: { ...breakdown, note: `${attribution} — attribution required if used`, attribution, license: p.license },
        previewUrl: p.url_m,
        photoRef: p.url_m,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}
