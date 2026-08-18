// One vendor-matching rule, shared by the discovery list and the map's vendor
// panel. It lives here rather than in either component because the map filters
// its pins with the same predicate the panel filters its list with — when the
// two drift apart the map shows pins the list has already hidden.
import { categoryMatches, creatorHandle } from "./vendorDisplay.js";

const NONE = { search: "", category: "all", creator: "all" };

export function matchesFilters(vendor, filters = {}) {
  const { search, category, creator } = { ...NONE, ...filters };

  const query = search.trim().toLowerCase();
  if (query) {
    const haystack = [vendor.name, vendor.cuisine_types, vendor.signature_dishes]
      .map((field) => String(field || "").toLowerCase());
    if (!haystack.some((field) => field.includes(query))) return false;
  }

  if (!categoryMatches(vendor, category)) return false;
  if (creator !== "all" && creatorHandle(vendor) !== creator) return false;
  return true;
}

// Drives the "Clear filters" affordance — there is nothing to clear when every
// filter is still at its default.
export function filtersActive(filters = {}) {
  const { search, category, creator } = { ...NONE, ...filters };
  return search.trim() !== "" || category !== "all" || creator !== "all";
}
