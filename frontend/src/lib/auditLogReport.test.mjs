import test from 'node:test';
import assert from 'node:assert/strict';

let model = {};
try { model = await import('./auditLogReport.js'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

test('audit entries share exact display formatting and expose only visible fields', () => {
  assert.equal(typeof model.formatAuditEntry, 'function');
  const date = '2026-09-02T08:48:44Z';
  assert.deepEqual(model.formatAuditEntry({ id: 'row-1', createdAt: date, action: 'vendor.update_status', entityType: 'vendor', entityId: 'demo-id', metadata: { token: 'PRIVATE' } }), {
    id: 'row-1', when: new Date(date).toLocaleString(), action: 'Vendor Update Status', entity: 'vendor · demo-id',
  });
});

test('audit missing values and invalid dates use readable consistent fallbacks', () => {
  assert.equal(typeof model.formatAuditEntry, 'function');
  assert.deepEqual(model.formatAuditEntry({ createdAt: 'invalid', entityId: 'orphan-id' }), { id: undefined, when: '—', action: '—', entity: '— · orphan-id' });
  assert.equal(model.formatAuditEntry({ action: 'review.hide', entityType: 'review' }).action, 'Review Hide');
});

test('audit report copies only table values and marks generation time separately', () => {
  assert.equal(typeof model.buildAuditLogReport, 'function');
  const entries = [{ id: 'PRIVATE_ROW_ID', action: 'vendor.update', entityType: 'vendor', entityId: 'shown-id', metadata: { source: 'PRIVATE_SOURCE' } }];
  const now = new Date('2026-09-03T01:00:00Z');
  const report = model.buildAuditLogReport(entries, now);
  assert.equal(report.title, 'My Audit Log');
  assert.equal(report.generated, `Generated ${now.toLocaleString()}`);
  assert.deepEqual(report.rows, [{ when: '—', action: 'Vendor Update', entity: 'vendor · shown-id' }]);
  assert.equal(report.count, 1);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|metadata/);
  entries[0].action = 'changed';
  assert.equal(report.rows[0].action, 'Vendor Update');
});

test('audit report describes filtered scope without including arbitrary query data', () => {
  const report = model.buildAuditLogReport([], new Date('2026-09-03T04:00:00Z'), {
    q: 'vendor', entity: 'vendor', sort: 'oldest', from: '', to: '', metadata: 'PRIVATE_QUERY',
  });
  assert.equal(typeof report.filters, 'string');
  assert.match(report.filters, /vendor/i);
  assert.match(report.filters, /Oldest first/);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_QUERY/);
});
