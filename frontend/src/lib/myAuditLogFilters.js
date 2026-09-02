const TIME_ZONE = 'Asia/Kuala_Lumpur';

export const AUDIT_ENTITY_OPTIONS = Object.freeze([
  ['all', 'All entities'], ['account', 'Accounts'], ['profile', 'Profiles'],
  ['suspension_appeal', 'Suspension appeals'], ['user', 'Users'], ['vendor', 'Vendors'],
  ['review', 'Reviews'], ['bookmark_folder', 'Bookmark folders'],
  ['vendor_suggestion', 'Vendor suggestions'], ['ai_job', 'AI jobs'],
].map(([value, label]) => Object.freeze({ value, label })));

export const AUDIT_PERIOD_OPTIONS = Object.freeze([
  ['all', 'Any time'], ['today', 'Today'], ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'], ['90d', 'Last 90 days'],
].map(([value, label]) => Object.freeze({ value, label })));

export const AUDIT_SORT_OPTIONS = Object.freeze([
  ['newest', 'Newest first'], ['oldest', 'Oldest first'],
].map(([value, label]) => Object.freeze({ value, label })));

const entityValues = new Set(AUDIT_ENTITY_OPTIONS.map(({ value }) => value));
const periodValues = new Set(AUDIT_PERIOD_OPTIONS.map(({ value }) => value));
const sortValues = new Set(AUDIT_SORT_OPTIONS.map(({ value }) => value));
const labelFor = (options, value) => options.find((option) => option.value === value)?.label;

function malaysiaMidnight(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - 8 * 60 * 60 * 1000;
}

function dateLabel(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

// Returns the exact server contract. `period` is deliberately UI-only and
// arbitrary properties (including pagination or actor identity) never cross
// this boundary.
export function createAuditLogQuery({ q = '', entity = 'all', period = 'all', sort = 'newest' } = {}, now = new Date()) {
  const safeEntity = entityValues.has(entity) ? entity : 'all';
  const safePeriod = periodValues.has(period) ? period : 'all';
  const safeSort = sortValues.has(sort) ? sort : 'newest';
  const safeQuery = String(q ?? '').trim().slice(0, 100);
  if (safePeriod === 'all') return Object.freeze({ q: safeQuery, entity: safeEntity, from: '', to: '', sort: safeSort });

  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90 }[safePeriod];
  const to = malaysiaMidnight(now) + 24 * 60 * 60 * 1000;
  const from = to - days * 24 * 60 * 60 * 1000;
  return Object.freeze({ q: safeQuery, entity: safeEntity, from: new Date(from).toISOString(), to: new Date(to).toISOString(), sort: safeSort });
}

export function describeAuditLogQuery(query = {}) {
  const entity = entityValues.has(query.entity) ? query.entity : 'all';
  const sort = sortValues.has(query.sort) ? query.sort : 'newest';
  const parts = [];
  if (query.q) parts.push(`Search: ${String(query.q).slice(0, 100)}`);
  parts.push(labelFor(AUDIT_ENTITY_OPTIONS, entity));
  if (query.from && query.to && Number.isFinite(new Date(query.from).getTime()) && Number.isFinite(new Date(query.to).getTime())) {
    const lastIncluded = new Date(new Date(query.to).getTime() - 1).toISOString();
    parts.push(`${dateLabel(query.from)} - ${dateLabel(lastIncluded)} (Malaysia)`);
  } else {
    parts.push('Any time');
  }
  parts.push(labelFor(AUDIT_SORT_OPTIONS, sort));
  return parts.join(' · ');
}
