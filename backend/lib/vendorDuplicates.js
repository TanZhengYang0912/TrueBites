// Fuzzy vendor-duplicate detection — a JS port of the scorer already used by
// the AI pipeline's /create-draft review gate (backend/services/supabase_client.py
// find_duplicate_vendors, lines 14-72), so Node and Python agree on what counts
// as "the same vendor" no matter which code path is creating one.

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

// Same weights/thresholds as the Python version: name*0.7 + location*0.3 when
// there's a location to compare, name alone otherwise; reject below 0.55;
// label >= 0.9 as "exact", else "possible".
function scoreCandidate(name, location, candidateName, candidateLocation) {
  const nameScore = sequenceRatio(normalizeMatchText(name), normalizeMatchText(candidateName));
  const locationScore = locationMatchScore(location, candidateLocation);
  const combined = location ? nameScore * 0.7 + locationScore * 0.3 : nameScore;
  if (nameScore < 0.55 || combined < 0.55) return null;
  return { match_score: Math.round(combined * 1000) / 1000, match_type: combined >= 0.9 ? "exact" : "possible" };
}

// Scores one candidate vendor_name/address against a list of existing rows
// (each needs at least id, vendor_name, address). `excludeId` skips a vendor
// against itself (for the "does this edit now collide with someone else"
// case — not currently wired up, but kept for future reuse).
function findDuplicatesFor({ vendor_name, address }, existingVendors, { excludeId } = {}) {
  const location = address || "";
  const results = [];
  for (const candidate of existingVendors) {
    if (excludeId && candidate.id === excludeId) continue;
    const scored = scoreCandidate(vendor_name, location, candidate.vendor_name, candidate.address);
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
      const scored = scoreCandidate(a.vendor_name, a.address || "", b.vendor_name, b.address || "");
      if (scored) groups.push({ a, b, ...scored });
    }
  }
  return groups.sort((x, y) => y.match_score - x.match_score);
}

export { normalizeMatchText, sequenceRatio, findDuplicatesFor, findAllDuplicateGroups };
