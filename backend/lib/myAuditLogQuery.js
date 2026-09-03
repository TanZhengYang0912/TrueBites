const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;

const ENTITY_TYPES = new Set([
  "all",
  "account",
  "profile",
  "suspension_appeal",
  "user",
  "vendor",
  "review",
  "bookmark_folder",
  "vendor_suggestion",
  "ai_job",
]);
const SORTS = new Set(["newest", "oldest"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANONICAL_ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function invalidFilter(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function rawValue(raw, key) {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? "";
  if (!raw || typeof raw !== "object") return "";
  const value = raw[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function stringValue(raw, key) {
  const value = rawValue(raw, key);
  return value == null ? "" : String(value);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDateBound(value, field) {
  if (!CANONICAL_ISO_UTC_RE.test(value)) {
    throw invalidFilter(`${field} must be canonical ISO UTC`);
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw invalidFilter(`${field} must be canonical ISO UTC`);
  }
  return value;
}

/**
 * Parse and validate the query controls used by the signed-in user's audit
 * log. The actor is deliberately not accepted here: it comes from the
 * verified request caller and is supplied separately to queryMyAuditLog.
 */
export function parseMyAuditLogQuery(raw = {}) {
  const page = positiveInteger(rawValue(raw, "page"), DEFAULT_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    positiveInteger(rawValue(raw, "pageSize"), DEFAULT_PAGE_SIZE),
  );
  const q = stringValue(raw, "q").trim();
  if (q.length > MAX_SEARCH_LENGTH) {
    throw invalidFilter(`search must be at most ${MAX_SEARCH_LENGTH} characters`);
  }

  const entity = stringValue(raw, "entity").trim() || "all";
  if (!ENTITY_TYPES.has(entity)) {
    throw invalidFilter(`entity filter is not supported: ${entity}`);
  }

  const fromInput = stringValue(raw, "from").trim();
  const toInput = stringValue(raw, "to").trim();
  if ((fromInput && !toInput) || (!fromInput && toInput)) {
    throw invalidFilter("date bounds must be supplied as a pair");
  }

  let from = "";
  let to = "";
  if (fromInput && toInput) {
    from = parseDateBound(fromInput, "from date");
    to = parseDateBound(toInput, "to date");
    if (Date.parse(from) >= Date.parse(to)) {
      throw invalidFilter("from date must be earlier than to date");
    }
  }

  const sort = stringValue(raw, "sort").trim() || "newest";
  if (!SORTS.has(sort)) {
    throw invalidFilter(`sort must be newest or oldest`);
  }

  return { page, pageSize, q, entity, from, to, sort };
}

// PostgREST's .or() receives raw grammar. Build a case-insensitive regex so
// `*` can remain a literal (PostgREST rewrites every `*` in LIKE/ILIKE values
// to `%`, even when the star is backslash-escaped). Every regex metacharacter
// is escaped before the value is quoted for the PostgREST logic-tree parser.
function escapeRegexLiteral(value) {
  return value.replace(/[\\^$.*+?()[\]{}|%_]/g, "\\$&");
}

function quotePostgrestValue(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function buildSearchFilter(q) {
  if (!q) return null;

  const pattern = quotePostgrestValue(`.*${escapeRegexLiteral(q)}.*`);
  const clauses = [
    `action.imatch.${pattern}`,
    `entity_type.imatch.${pattern}`,
  ];
  if (UUID_RE.test(q)) clauses.push(`entity_id.eq.${q}`);
  return clauses.join(",");
}

/**
 * Query only the verified actor's audit rows and return the public display
 * shape used by the existing My Audit Log endpoint.
 */
export async function queryMyAuditLog(supabase, actorId, parsed) {
  let request = supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, created_at", { count: "exact" })
    .eq("actor_id", actorId);

  if (parsed.entity !== "all") request = request.eq("entity_type", parsed.entity);
  if (parsed.from) request = request.gte("created_at", parsed.from).lt("created_at", parsed.to);

  const searchFilter = buildSearchFilter(parsed.q);
  if (searchFilter) request = request.or(searchFilter);

  const { data, error, count } = await request
    .order("created_at", { ascending: parsed.sort === "oldest" })
    .order("id", { ascending: true })
    .range((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize - 1);
  if (error) throw error;

  const total = count || 0;
  return {
    items: (data || []).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
    })),
    pagination: {
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
    },
  };
}
