// The screen and its PDF consume this display-only snapshot, never separate queries.
export const DASHBOARD_COPY = {
  eyebrow: 'Operations overview',
  title: 'Good morning, Admin',
  subtitle: 'Monitor vendor quality, content processing, and moderation from one place.',
  growth: { title: 'Vendor growth', subtitle: 'New records created during the selected period', empty: 'No data available for this period.' },
  attention: { title: 'Needs attention', subtitle: 'Items that need an admin decision', empty: 'No immediate issues.' },
  pipeline: { title: 'AI content pipeline', subtitle: 'Persisted content outcomes', empty: 'Pipeline data is not available yet.' },
  categories: { title: 'Vendor categories', subtitle: 'Current database mix', empty: 'No data available for this period.' },
  sources: { title: 'Source mix', subtitle: 'AI-imported records', empty: 'No data available for this period.' },
  activity: { title: 'Recent activity', subtitle: 'Latest changes across the admin console', empty: 'No recent activity yet.' },
};

// Match the admin CSS tokens. Bar "success" currently uses the default blue fill.
export const DASHBOARD_COLORS = {
  blue: '#3658D4', teal: '#198A70', warning: '#B7791F', danger: '#C44747',
  accent: '#6858C7', ink: '#17212B', muted: '#667281', border: '#E3E7ED',
  background: '#F6F7F9', panel: '#FFFFFF', track: '#F1F4F8',
};
export const TREND_SERIES = [
  { key: 'value', label: 'New vendors', tone: 'blue' },
  { key: 'active', label: 'Active', tone: 'teal' },
  { key: 'draft', label: 'Draft', tone: 'warning' },
];

const rows = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
const text = (value, fallback = '') => value == null || value === '' ? fallback : String(value);
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const fallbackKeys = ['totalVendors', 'activeRate', 'pendingDrafts', 'aiImported'];
const breakdown = (items) => rows(items).map((item) => ({ label: text(item.label, 'Unknown'), value: numeric(item.value), tone: text(item.tone) }));

export function barTone(tone, fallback = 'blue') {
  return ['blue', 'teal', 'warning', 'danger', 'accent'].includes(tone) ? tone : fallback;
}

export function chartMaximum(data, keys = ['value']) {
  return Math.max(1, ...data.flatMap((item) => keys.map((key) => numeric(item[key]))));
}

export function chartPoints(data, key, { width, top, bottom, max }) {
  return data.map((item, index) => [
    data.length <= 1 ? width / 2 : index / (data.length - 1) * width,
    bottom - numeric(item[key]) / max * (bottom - top),
  ]);
}

export function buildDashboardReport(payload = {}, selectedRange = 30) {
  const data = payload || {};
  const range = [7, 30, 90].includes(selectedRange) ? selectedRange : 30;
  const updated = data.lastUpdated && new Date(data.lastUpdated);
  const updatedLabel = updated && Number.isFinite(updated.getTime())
    ? updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now';
  const kpis = rows(data.kpis).length ? rows(data.kpis) : rows(data.stats);
  return {
    heading: { eyebrow: DASHBOARD_COPY.eyebrow, title: DASHBOARD_COPY.title, subtitle: DASHBOARD_COPY.subtitle, updated: `Updated ${updatedLabel}` },
    range, rangeLabel: `Last ${range} days`,
    kpis: kpis.map((item, index) => ({
      key: text(item.key, fallbackKeys[index] || `stat-${index}`), label: text(item.label),
      value: numeric(item.value), suffix: text(item.suffix), note: text(item.note), tone: text(item.tone, 'neutral'),
    })),
    trend: rows(data.vendorTrend).slice(-range).map((item) => ({
      label: text(item.label, '—'), value: numeric(item.value), active: numeric(item.active), draft: numeric(item.draft),
    })),
    attentionItems: rows(data.attentionItems).map((item, index) => ({
      id: text(item.id, `attention-${index}`), label: text(item.label), value: numeric(item.value),
      tone: text(item.tone, 'neutral'), href: text(item.href, '/admin'),
    })),
    aiPipeline: breakdown(data.aiPipeline),
    categoryBreakdown: breakdown(data.categoryBreakdown),
    sourceBreakdown: breakdown(data.sourceBreakdown),
    activityRows: [
      ...rows(data.recentVendors).slice(0, 4).map((item, index) => ({
        id: `vendor-${item.id ?? index}`, type: 'Vendor', title: text(item.name, 'Untitled'),
        meta: `${text(item.category, 'Uncategorized')} · ${text(item.location, 'Unknown')}`,
        status: text(item.status, 'Updated'), href: '/admin/vendors2',
      })),
      ...rows(data.recentProcessing).slice(0, 4).map((item, index) => ({
        id: `ai-${item.id ?? index}`, type: text(item.platform, 'Unknown'), title: text(item.vendor, 'Untitled'),
        meta: text(item.recommendation), status: 'AI imported', href: '/admin/ai',
      })),
    ].slice(0, 6),
  };
}
