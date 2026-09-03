import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'jspdf';

let exporter = {};
try { exporter = await import('./myAuditLogExport.js'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

function browser(t, blocked = false) {
  const events = [], revoked = [], blobs = [];
  let tick;
  const popup = { closed: false, opener: {}, document: { title: '', body: { textContent: '' } }, location: { replace: (url) => events.push(url) }, close() { this.closed = true; } };
  const previous = globalThis.window;
  globalThis.window = { open() { events.push('open'); return blocked ? null : popup; }, setInterval(callback) { tick = callback; return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  t.mock.method(globalThis, 'fetch', async (url) => new Response(await readFile(new URL(`../../public${url}`, import.meta.url))));
  t.mock.method(URL, 'createObjectURL', (blob) => { blobs.push(blob); return 'blob:audit-test'; });
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url));
  return { popup, events, revoked, blobs, tick: () => tick?.() };
}

test('personal export reserves preview then fetches all pages at 100 and releases its URL', async (t) => {
  assert.equal(typeof exporter.openMyAuditLogPdf, 'function');
  const env = browser(t), calls = [];
  const pending = exporter.openMyAuditLogPdf(async ({ page, pageSize }) => {
    assert.equal(env.events[0], 'open');
    calls.push({ page, pageSize });
    const count = page < 3 ? 100 : 5;
    return { items: Array.from({ length: count }, (_, i) => ({ id: `${page}-${i}`, action: 'vendor.update', entityType: 'vendor', entityId: `demo-${page}-${i}`, metadata: { reason: 'PRIVATE_SENTINEL' } })), pagination: { page, pageSize, total: 205, totalPages: 3 } };
  });
  assert.equal(env.events[0], 'open');
  await pending;
  assert.deepEqual(calls, [{ page: 1, pageSize: 100 }, { page: 2, pageSize: 100 }, { page: 3, pageSize: 100 }]);
  assert.equal(env.popup.opener, null);
  assert.equal(env.blobs.length, 1);
  const output = Buffer.from(await env.blobs[0].arrayBuffer()).toString('latin1');
  assert.ok(output.startsWith('%PDF-'));
  assert.ok(output.includes('205 personal audit entries'));
  assert.doesNotMatch(output, /PRIVATE_SENTINEL/);
  env.popup.closed = true; env.tick();
  assert.deepEqual(env.revoked, ['blob:audit-test']);
});

test('blocked audit preview does not fetch any records', async (t) => {
  assert.equal(typeof exporter.openMyAuditLogPdf, 'function');
  const env = browser(t, true);
  let fetched = false;
  await assert.rejects(exporter.openMyAuditLogPdf(async () => { fetched = true; }), /Allow pop-ups/);
  assert.equal(fetched, false);
  assert.equal(env.blobs.length, 0);
});

test('failed later page closes preview, never publishes partial data, and retry succeeds', async (t) => {
  assert.equal(typeof exporter.openMyAuditLogPdf, 'function');
  const env = browser(t);
  await assert.rejects(exporter.openMyAuditLogPdf(async ({ page }) => {
    if (page === 2) throw new Error('PRIVATE_BACKEND_DETAIL');
    return { items: [{ action: 'vendor.update' }], pagination: { totalPages: 2 } };
  }), (error) => /Could not prepare/.test(error.message) && !error.message.includes('PRIVATE'));
  assert.equal(env.popup.closed, true);
  assert.equal(env.blobs.length, 0);
  env.popup.closed = false;
  await exporter.openMyAuditLogPdf(async () => ({ items: [], pagination: { totalPages: 1 } }));
  assert.equal(env.blobs.length, 1);
});

test('closing the preparing window discards the pending export', async (t) => {
  assert.equal(typeof exporter.openMyAuditLogPdf, 'function');
  const env = browser(t);
  await exporter.openMyAuditLogPdf(async () => {
    env.popup.closed = true;
    return { items: [], pagination: { totalPages: 1 } };
  });
  assert.equal(env.blobs.length, 0);
});

test('aborting a pending personal export closes preview and prevents later-page fetches', async (t) => {
  const env = browser(t), controller = new AbortController();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const pending = exporter.openMyAuditLogPdf(async ({ page }) => {
    calls.push(page);
    await gate;
    return { items: [{ action: 'vendor.update' }], pagination: { totalPages: 3 } };
  }, { signal: controller.signal });
  controller.abort();
  const closedImmediately = env.popup.closed;
  release();
  await pending;
  assert.equal(closedImmediately, true);
  assert.deepEqual(calls, [1]);
  assert.equal(env.blobs.length, 0);
});

test('personal export forwards its cancellation signal to the in-flight page request', async (t) => {
  const env = browser(t), controller = new AbortController();
  let receivedSignal, release;
  const pending = exporter.openMyAuditLogPdf(async (options) => {
    receivedSignal = options.signal;
    await new Promise((resolve) => { release = resolve; });
    return { items: [], pagination: { totalPages: 1 } };
  }, { signal: controller.signal });
  controller.abort();
  release();
  await pending;
  assert.equal(receivedSignal, controller.signal);
  assert.equal(env.blobs.length, 0);
});

test('personal PDF snapshots only canonical filters for every page and cannot override pagination', async (t) => {
  browser(t);
  const calls = [];
  const query = { q: 'vendor', entity: 'vendor', from: '2026-08-27T16:00:00.000Z', to: '2026-09-03T16:00:00.000Z', sort: 'oldest', page: 99, actorId: 'OTHER_ADMIN' };
  const expected = { q: query.q, entity: query.entity, from: query.from, to: query.to, sort: query.sort };
  await exporter.openMyAuditLogPdf(async options => {
    calls.push({ ...options });
    query.q = 'review'; query.sort = 'newest';
    return { items: [{ action: 'vendor.update' }], pagination: { totalPages: 2 } };
  }, { query });
  assert.equal(calls.length, 2);
  for (const [index, call] of calls.entries()) {
    assert.deepEqual(call, { ...expected, page: index + 1, pageSize: 100, signal: undefined });
  }
});
