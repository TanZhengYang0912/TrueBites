// Fuzzy vendor-duplicate detection — a JS port of the scorer already used by
// the AI pipeline's /create-draft review gate (backend/services/supabase_client.py
// find_duplicate_vendors, lines 14-72), so Node and Python agree on what counts
// as "the same vendor" no matter which code path is creating one.
//
// NOTE: the distance-based scoring added below (see DUPLICATE_DISTANCE_METERS)
// is NOT yet mirrored in that Python version — it only affects the admin
// console's own duplicate check (POST /api/admin/vendors and the "possible
// duplicates" panel), not the AI pipeline's /create-draft gate. Worth
// porting there too if the same false-positive (a chain's own branches
// flagged as duplicates of each other) shows up on that path.
import { haversine } from "../haversine.js";

// Mirrors _normalize_match_text: lowercase, collapse everything that isn't
// a-z0-9 into single spaces.
function normalizeMatchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Same ratio SequenceMatcher.ratio() computes: 2*M / T, where M is the total
// length of matching blocks (found via the same greedy longest-common-substring
// recursion Python's difflib uses) and T is the combined length of both strings.
function sequenceRatio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const matches = totalMatchingBlockLength(a, b, 0, a.length, 0, b.length);
  return (2 * matches) / (a.length + b.length);
}

function totalMatchingBlockLength(a, b, aLo, aHi, bLo, bHi) {
  const [i, j, size] = longestMatch(a, b, aLo, aHi, bLo, bHi);
  if (size === 0) return 0;
  let total = size;
  if (i > aLo && j > bLo) total += totalMatchingBlockLength(a, b, aLo, i, bLo, j);
  if (i + size < aHi && j + size < bHi) total += totalMatchingBlockLength(a, b, i + size, aHi, j + size, bHi);
  return total;
}

function longestMatch(a, b, aLo, aHi, bLo, bHi) {
  let bestI = aLo, bestJ = bLo, bestSize = 0;
  // j2len[j] = length of the match ending at (i-1, j-1)
  let j2len = {};
  for (let i = aLo; i < aHi; i++) {
    const newJ2len = {};
    for (let j = bLo; j < bHi; j++) {
      if (a[i] === b[j]) {
        const k = (j2len[j - 1] || 0) + 1;
        newJ2len[j] = k;
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    j2len = newJ2len;
  }
  return [bestI, bestJ, bestSize];
}

// Mirrors _location_match_score: Jaccard overlap of whitespace-split tokens.
function locationMatchScore(left, right) {
  const leftTokens = new Set(normalizeMatchText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeMatchText(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  leftTokens.forEach((t) => { if (rightTokens.has(t)) overlap++; });
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

// A chain's own branches (e.g. "SecretRecipe @ Melaka Raya" and "SecretRecipe
// @ Ayer Keroh") legitimately share the same or a near-identical name, so
// name similarity alone can never be the deciding signal — two vendors that
// are actually far apart are different outlets, not a duplicate row for the
// same physical shop, no matter how well their names match. Same scale as
// photoMatching.js's own DISTANCE_DECAY_METERS ("Melaka's old-town shoplots
// sit a few metres apart... a match 500m away is very unlikely to be the
// same small stall") — that reasoning applies just as well here. Not
// imported from there directly: photoMatching.js already imports FROM this
// file, and importing back would create a cycle.
const DUPLICATE_DISTANCE_METERS = 500;

// Same weights/thresholds as the Python version: name*0.7 + location*0.3 when
// there's a location to compare, name alone otherwise; reject below 0.55;
// label >= 0.9 as "exact", else "possible". `coords`, when both sides have
// valid latitude/longitude, swaps the location component from fuzzy
// address-text overlap to real geographic distance — Malaysian addresses
// share so much boilerplate ("Jalan", "No", "Melaka") that two branches on
// opposite sides of town can still score a nonzero token overlap, whereas
// actual distance is what genuinely distinguishes "the same shop, entered
// twice" from "a different outlet of the same chain". Beyond
// DUPLICATE_DISTANCE_METERS, this returns null outright — no name match is
// close enough to override two vendors that are simply nowhere near each
// other.
function scoreCandidate(name, location, candidateName, candidateLocation, coords) {
  const nameScore = sequenceRatio(normalizeMatchText(name), normalizeMatchText(candidateName));
  if (nameScore < 0.55) return null;

  const hasCoords = coords
    && [coords.aLat, coords.aLng, coords.bLat, coords.bLng].every((v) => v != null && Number.isFinite(Number(v)));

  let locationScore;
  let hasLocation;
  if (hasCoords) {
    const distanceMeters = haversine(coords.aLat, coords.aLng, coords.bLat, coords.bLng) * 1000;
    if (distanceMeters > DUPLICATE_DISTANCE_METERS) return null;
    locationScore = Math.max(0, 1 - distanceMeters / DUPLICATE_DISTANCE_METERS);
    hasLocation = true;
  } else {
    // No usable coordinates on one or both sides — fall back to the
    // original address-text heuristic (a weaker signal, but better than
    // ignoring location entirely).
    locationScore = locationMatchScore(location, candidateLocation);
    hasLocation = Boolean(location);
  }

  const combined = hasLocation ? nameScore * 0.7 + locationScore * 0.3 : nameScore;
  if (combined < 0.55) return null;
  return { match_score: Math.round(combined * 1000) / 1000, match_type: combined >= 0.9 ? "exact" : "possible" };
}

// Scores one candidate vendor_name/address against a list of existing rows
// (each needs at least id, vendor_name, address; latitude/longitude are used
// when present on both sides — see scoreCandidate). `excludeId` skips a
// vendor against itself (for the "does this edit now collide with someone
// else" case — not currently wired up, but kept for future reuse).
function findDuplicatesFor({ vendor_name, address, latitude, longitude }, existingVendors, { excludeId } = {}) {
  const location = address || "";
  const results = [];
  for (const candidate of existingVendors) {
    if (excludeId && candidate.id === excludeId) continue;
    const scored = scoreCandidate(vendor_name, location, candidate.vendor_name, candidate.address, {
      aLat: latitude, aLng: longitude, bLat: candidate.latitude, bLng: candidate.longitude,
    });
    if (scored) results.push({ ...candidate, ...scored });
  }
  return results.sort((a, b) => b.match_score - a.match_score).slice(0, 10);
}

// Pairwise scan across the whole vendor list, for the admin "possible
// duplicates" review panel. O(n^2) — fine at hundreds of rows server-side,
// not meant for live-typing use (that's findDuplicatesFor above).
function findAllDuplicateGroups(vendors) {
  const groups = [];
  for (let i = 0; i < vendors.length; i++) {
    for (let j = i + 1; j < vendors.length; j++) {
      const a = vendors[i], b = vendors[j];
      const scored = scoreCandidate(a.vendor_name, a.address || "", b.vendor_name, b.address || "", {
        aLat: a.latitude, aLng: a.longitude, bLat: b.latitude, bLng: b.longitude,
      });
      if (scored) groups.push({ a, b, ...scored });
    }
  }
  return groups.sort((x, y) => y.match_score - x.match_score);
}

export { normalizeMatchText, sequenceRatio, findDuplicatesFor, findAllDuplicateGroups };
