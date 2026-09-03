import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { buildDashboardReport } from './dashboardReport.js';

import * as pdf from './dashboardPdf.js';

function fixture() {
  return buildDashboardReport({
    kpis: [
      { key: 'totalVendors', label: 'Total vendors', value: 607, note: '300 active' },
      { key: 'activeRate', label: 'Active rate', value: 49, suffix: '%', note: 'of all vendor records' },
      { key: 'pendingDrafts', label: 'Pending drafts', value: 297, note: 'awaiting approval' },
      { key: 'aiImported', label: 'AI imported', value: 605, note: '297 still in draft' },
      { key: 'reviews', label: 'Reviews', value: 28, note: '3 hidden' },
    ],
    vendorTrend: Array.from({ length: 90 }, (_, i) => ({ label: `Day ${i}`, value: i === 86 ? 3 : 0, active: 0, draft: i === 86 ? 1 : 0 })),
    attentionItems: [{ id: 'hours', label: 'Vendors missing operating hours', value: 4 }],
    aiPipeline: [{ label: 'Needs review', value: 297, tone: 'warning' }],
    categoryBreakdown: [{ label: 'Malaysian / Local', value: 349 }],
    sourceBreakdown: [{ label: 'TikTok', value: 605 }],
    recentVendors: Array.from({ length: 4 }, (_, i) => ({ id: i, name: `Vendor ${i}`, category: 'Cafe', location: 'Melaka', status: 'ACTIVE' })),
    recentProcessing: [{ id: 1, vendor: 'Imported vendor', platform: 'TikTok', recommendation: 'Recommended' }],
    lastUpdated: '2026-09-03T00:01:00Z',
    statusBreakdown: [{ label: 'Never export this', value: 607 }],
  }, 7);
}

function render(report) {
  assert.equal(typeof pdf.renderDashboardPdf, 'function');
  const doc = new jsPDF({ unit: 'pt', orientation: 'landscape', compress: false });
  pdf.renderDashboardPdf(doc, report);
  return doc;
}

test('real PDF uses two landscape pages and all dashboard modules', () => {
  const doc = render(fixture());
  assert.equal(doc.getNumberOfPages(), 2);
  assert.ok(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight());
  const output = doc.output();
  for (const label of ['607', '49%', '297', '605', '28', 'Vendor growth', 'Needs attention', 'Last 7 days', 'AI content pipeline', 'Vendor categories', 'Source mix', 'Recent activity', 'Vendor 0', 'Imported vendor']) {
    assert.ok(output.includes(label), `Searchable text missing: ${label}`);
  }
  assert.doesNotMatch(output, /Vendor status|Never export this|LAYOUT PREVIEW|NaN/);
  assert.ok(output.indexOf('Vendor growth') < output.indexOf('AI content pipeline'));
});

test('PDF retains empty modules and does not invent a trend series', () => {
  const doc = render(buildDashboardReport({}));
  const output = doc.output();
  for (const label of ['No data available for this period.', 'No immediate issues.', 'Pipeline data is not available yet.', 'No recent activity yet.']) {
    assert.ok(output.includes(label), label);
  }
});

test('six normal categories and six activity rows still fit the two-page design', () => {
  const model = fixture();
  model.categoryBreakdown = Array.from({ length: 6 }, (_, i) => ({ label: `Category ${i}`, value: i + 1 }));
  model.activityRows.push({ type: 'TikTok', title: 'Last imported vendor', meta: 'Highly recommended', status: 'AI imported' });
  assert.equal(render(model).getNumberOfPages(), 2);
});

test('long labels and activity use continuation pages without losing trailing text', () => {
  const model = fixture();
  model.categoryBreakdown = Array.from({ length: 35 }, (_, i) => ({ label: `Category ${i} ${'long readable label '.repeat(5)}`, value: i + 1 }));
  model.activityRows[0].meta = `${'Long detail '.repeat(900)}END OF LONG DETAIL`;
  const doc = render(model);
  const output = doc.output();
  assert.ok(doc.getNumberOfPages() > 2);
  assert.ok(output.includes('Category 34'));
  assert.ok(output.includes('END OF LONG DETAIL'));
  assert.ok(output.includes('Recent activity'));
  assert.doesNotMatch(output, /NaN/);
});

test('oversized KPI notes continue inside page margins rather than extending off paper', () => {
  const model = fixture();
  model.kpis[0].note = `${'Long KPI note '.repeat(400)}END KPI NOTE`;
  const doc = new jsPDF({ unit: 'pt', orientation: 'landscape' });
  const originalText = doc.text.bind(doc);
  const overflow = [];
  doc.text = (value, x, y, ...rest) => {
    if (y > 551 && !String(value).startsWith('TrueBites ·') && !/^\d+ \/ \d+$/.test(String(value))) overflow.push({ value, y });
    return originalText(value, x, y, ...rest);
  };
  pdf.renderDashboardPdf(doc, model);
  assert.deepEqual(overflow, []);
  assert.ok(doc.output().includes('END KPI NOTE'));
});
