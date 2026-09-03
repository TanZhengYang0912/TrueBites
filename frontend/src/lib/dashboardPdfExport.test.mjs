import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'jspdf'; // Load the real library before substituting only browser boundaries.
import { openOverviewPdf } from './exportPdf.js';
import { buildDashboardReport } from './dashboardReport.js';

function browser(t, { blocked = false } = {}) {
  const events = [], urls = [], revoked = [];
  let tick;
  const popup = { closed: false, opener: {}, document: { title: '', body: { textContent: '' } }, location: { replace: (url) => urls.push(url) }, close() { this.closed = true; } };
  t.mock.method(globalThis, 'fetch', async (url) => new Response(await readFile(new URL(`../../public${url}`, import.meta.url))));
  t.mock.method(URL, 'createObjectURL', (blob) => { events.push(blob); return 'blob:local-test'; });
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url));
  const oldWindow = globalThis.window;
  globalThis.window = {
    open() { events.push('open'); return blocked ? null : popup; },
    setInterval(callback) { tick = callback; return 1; }, clearInterval() { events.push('clearInterval'); },
    addEventListener() {}, removeEventListener() {},
  };
  t.after(() => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; });
  return { popup, events, urls, revoked, tick: () => tick?.() };
}

test('overview reserves its preview synchronously and releases its PDF URL when closed', async (t) => {
  const env = browser(t);
  const promise = openOverviewPdf(buildDashboardReport({}));
  const openedSynchronously = env.events[0] === 'open';
  await promise;
  assert.ok(openedSynchronously);
  assert.equal(env.popup.opener, null);
  assert.deepEqual(env.urls, ['blob:local-test']);
  assert.equal(env.events[1].type, 'application/pdf');
  env.popup.closed = true;
  env.tick();
  assert.deepEqual(env.revoked, ['blob:local-test']);
});

test('blocked preview rejects clearly before doing expensive export work', async (t) => {
  const env = browser(t, { blocked: true });
  await assert.rejects(openOverviewPdf(buildDashboardReport({})), /pop-up/i);
  assert.deepEqual(env.events, ['open']);
});

test('export failure closes the empty preview and does not disclose source data', async (t) => {
  const env = browser(t);
  const model = buildDashboardReport({ recentVendors: [{ name: 'UNSUPPORTED \u{10FFFF} PRIVATE' }] });
  await assert.rejects(openOverviewPdf(model), (error) => !/PRIVATE/.test(error.message));
  assert.equal(env.popup.closed, true);
  assert.equal(env.urls.length, 0);
});
