const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 6;
const MAX_PAGE_SIZE = 12;
const TYPES = new Set(["all", "vendor", "creator"]);
const STATUSES = new Set(["all", "pending", "published", "rejected"]);
const TERMINAL_STATUSES = ["published", "rejected", "failed", "duplicate"];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSuggestionListQuery(searchParams = new URLSearchParams()) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams);
  const page = positiveInteger(params.get("page"), DEFAULT_PAGE);
  const requestedPageSize = positiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const type = TYPES.has(params.get("type")) ? params.get("type") : "all";
  const status = STATUSES.has(params.get("status")) ? params.get("status") : "all";
  const from = (page - 1) * pageSize;

  return { page, pageSize, type, status, from, to: from + pageSize - 1 };
}

export function applySuggestionListFilters(queryBuilder, { type, status }) {
  let filtered = queryBuilder;
  if (type !== "all") filtered = filtered.eq("suggestion_type", type);
  if (status === "published") filtered = filtered.eq("status", "published");
  if (status === "rejected") filtered = filtered.in("status", ["rejected", "failed", "duplicate"]);
  if (status === "pending") filtered = filtered.not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);
  return filtered;
}

export function summarizeSuggestionCounts(rows = []) {
  const counts = {
    types: { all: 0, vendor: 0, creator: 0 },
    statuses: { all: 0, pending: 0, published: 0, rejected: 0 },
  };

  for (const row of rows) {
    counts.types.all += 1;
    counts.types[row.suggestion_type === "creator" ? "creator" : "vendor"] += 1;
    counts.statuses.all += 1;

    if (row.status === "published") counts.statuses.published += 1;
    else if (TERMINAL_STATUSES.includes(row.status)) counts.statuses.rejected += 1;
    else counts.statuses.pending += 1;
  }

  return counts;
}
