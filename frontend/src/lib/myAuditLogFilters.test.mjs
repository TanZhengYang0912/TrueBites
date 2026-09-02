import test from 'node:test';
import assert from 'node:assert/strict';

let filters = {};
try { filters = await import('./myAuditLogFilters.js'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

test('default personal audit query contains only the canonical query fields', () => {
  assert.equal(typeof filters.createAuditLogQuery, 'function');
  assert.deepEqual(filters.createAuditLogQuery(), { q: '', entity: 'all', from: '', to: '', sort: 'newest' });
  assert.deepEqual(filters.createAuditLogQuery({ q: ' vendor ', entity: 'vendor', sort: 'oldest', actorId: 'OTHER_ADMIN', page: 20 }), { q: 'vendor', entity: 'vendor', from: '', to: '', sort: 'oldest' });
});

test('time presets resolve Malaysian calendar days, not browser local or rolling hours', () => {
  assert.equal(typeof filters.createAuditLogQuery, 'function');
  const now = new Date('2026-09-02T16:01:00Z');
  const today = filters.createAuditLogQuery({ period: 'today' }, now);
  assert.equal(today.from, '2026-09-02T16:00:00.000Z');
  assert.equal(today.to, '2026-09-03T16:00:00.000Z');
  for (const [period, from] of [['7d', '2026-08-27T16:00:00.000Z'], ['30d', '2026-08-04T16:00:00.000Z'], ['90d', '2026-06-05T16:00:00.000Z']]) {
    const query = filters.createAuditLogQuery({ period }, now);
    assert.equal(query.from, from);
    assert.equal(query.to, today.to);
  }
  const beforeMidnight = filters.createAuditLogQuery({ period: 'today' }, new Date('2026-09-02T15:59:59Z'));
  assert.equal(beforeMidnight.from, '2026-09-01T16:00:00.000Z');
  assert.equal(beforeMidnight.to, today.from);
});

test('query summary includes all selected conditions and explicit order', () => {
  assert.equal(typeof filters.describeAuditLogQuery, 'function');
  const query = filters.createAuditLogQuery({ q: 'vendor', entity: 'vendor', period: 'today', sort: 'oldest' }, new Date('2026-09-03T04:00:00Z'));
  const summary = filters.describeAuditLogQuery(query);
  assert.match(summary, /vendor/i);
  assert.match(summary, /oldest first/i);
  assert.match(summary, /2026/);
  assert.match(summary, /Malaysia|Kuala.Lumpur|UTC\+8/i);
  const defaultSummary = filters.describeAuditLogQuery(filters.createAuditLogQuery());
  assert.match(defaultSummary, /All entities/);
  assert.match(defaultSummary, /Any time/);
  assert.match(defaultSummary, /Newest first/);
});
