const ARRAY_SECTIONS = [
  'stats',
  'vendorTrend',
  'statusBreakdown',
  'categoryBreakdown',
  'sourceBreakdown',
  'aiPipeline',
  'attentionItems',
  'recentVendors',
  'recentProcessing',
];

export function normalizeDashboardPayload(payload = {}) {
  const normalized = { ...payload };
  ARRAY_SECTIONS.forEach((section) => {
    if (!Array.isArray(normalized[section])) normalized[section] = [];
  });
  return normalized;
}

export function statusToneFor(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'draft') return 'draft';
  if (normalized === 'suspended' || normalized === 'hidden' || normalized === 'rejected') return 'suspended';
  return 'active';
}

export function formatMetricDelta(current, previous) {
  const next = Number(current) || 0;
  const prior = Number(previous) || 0;
  if (prior === 0) return { label: next === 0 ? '—' : '+100%', tone: next === 0 ? 'neutral' : 'positive' };
  const percentage = Math.round(((next - prior) / Math.abs(prior)) * 100);
  return {
    label: `${percentage > 0 ? '+' : ''}${percentage}%`,
    tone: percentage === 0 ? 'neutral' : percentage > 0 ? 'positive' : 'negative',
  };
}
