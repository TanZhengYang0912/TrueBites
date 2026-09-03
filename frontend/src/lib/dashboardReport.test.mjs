import test from 'node:test';
import assert from 'node:assert/strict';

import * as report from './dashboardReport.js';

test('dashboard has a shared display-only report model', () => {
  assert.equal(typeof report.buildDashboardReport, 'function');
});

test('report snapshots the selected growth range without filtering total KPIs', () => {
  const data = {
    kpis: [{ key: 'totalVendors', label: 'Total vendors', value: 607, note: '300 active' }],
    vendorTrend: Array.from({ length: 90 }, (_, i) => ({ label: `Day ${i}`, value: i, active: i / 2, draft: 0 })),
    lastUpdated: '2026-09-03T00:01:00Z',
  };
  for (const range of [7, 30, 90]) {
    const result = report.buildDashboardReport(data, range);
    assert.equal(result.rangeLabel, `Last ${range} days`);
    assert.equal(result.trend.length, range);
    assert.equal(result.trend[0].label, `Day ${90 - range}`);
    assert.equal(result.kpis[0].value, 607);
    data.vendorTrend[89].value = 999;
    assert.notEqual(result.trend[range - 1].value, 999);
    data.vendorTrend[89].value = 89;
  }
});

test('activity preserves the exact dashboard fields and six-row selection', () => {
  const data = {
    recentVendors: Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Vendor ${i}`, category: 'Cafe', location: 'Melaka', status: 'DRAFT', token: 'PRIVATE' })),
    recentProcessing: Array.from({ length: 5 }, (_, i) => ({ id: i, title: 'NOT DISPLAYED', vendor: `Imported ${i}`, platform: 'TikTok', recommendation: 'Recommended' })),
    source_video_url: '/private/storage/SECRET',
  };
  const result = report.buildDashboardReport(data);
  assert.equal(result.activityRows.length, 6);
  assert.equal(result.activityRows[0].meta, 'Cafe · Melaka');
  assert.equal(result.activityRows[3].title, 'Vendor 3');
  assert.equal(result.activityRows[4].title, 'Imported 0');
  assert.equal(result.activityRows[4].status, 'AI imported');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SECRET|NOT DISPLAYED/);
});

test('empty, legacy and malformed data use consistent readable fallbacks', () => {
  const empty = report.buildDashboardReport({ kpis: null, vendorTrend: null, lastUpdated: 'bad date' }, 14);
  assert.deepEqual(empty.trend, []);
  assert.deepEqual(empty.activityRows, []);
  assert.equal(empty.range, 30);
  assert.equal(empty.heading.updated, 'Updated just now');
  const legacy = report.buildDashboardReport({ stats: [{ label: 'Total Vendors', value: 12, note: 'Existing records' }] });
  assert.equal(legacy.kpis[0].value, 12);
  assert.equal(legacy.kpis[0].key, 'totalVendors');
  const malformed = report.buildDashboardReport({ categoryBreakdown: [null, { label: 'Cafe', value: NaN }] });
  assert.equal(malformed.categoryBreakdown[0].value, 0);
  assert.equal(report.chartMaximum([{ value: 0 }]), 1);
});

test('shared chart math retains dashboard scaling and line positions', () => {
  assert.equal(report.chartMaximum([{ value: 2, active: 4, draft: 1 }], ['value', 'active', 'draft']), 4);
  assert.deepEqual(report.chartPoints([{ value: 0 }, { value: 4 }], 'value', { width: 100, top: 10, bottom: 50, max: 4 }), [[0, 50], [100, 10]]);
  assert.equal(report.barTone('success'), 'blue'); // Current dashboard .admin-bar-fill fallback.
  assert.equal(report.barTone(undefined, 'teal'), 'teal');
});
