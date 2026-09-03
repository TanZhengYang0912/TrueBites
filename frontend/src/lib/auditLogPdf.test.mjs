import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { installDashboardFonts } from './dashboardPdfFonts.js';

let pdf = {};
try { pdf = await import('./auditLogPdf.js'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

function report(count = 1) {
  return { title: 'My Audit Log', subtitle: "Everything you've personally done in the admin console", generated: 'Generated 03/09/2026, 10:00:00', count,
    rows: Array.from({ length: count }, (_, i) => ({ when: '02/09/2026, 16:48:44', action: `Vendor Update ${i}`, entity: `vendor · demo-id-${i}` })),
  };
}

function render(model) {
  assert.equal(typeof pdf.renderAuditLogPdf, 'function');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: false });
  pdf.renderAuditLogPdf(doc, model);
  return doc;
}

test('audit PDF paginates all records, repeats columns and includes the final row', () => {
  const doc = render(report(205));
  assert.ok(doc.getNumberOfPages() > 2);
  const output = doc.output();
  for (const value of ['My Audit Log', '205 entries', 'Vendor Update 204', 'demo-id-204', 'Generated 03/09/2026']) assert.ok(output.includes(value), value);
  for (const label of ['When', 'Action', 'Entity']) assert.equal(output.split(`(${label})`).length - 1, doc.getNumberOfPages());
});

test('empty audit PDF is still a titled one-page report', () => {
  const doc = render(report(0));
  assert.equal(doc.getNumberOfPages(), 1);
  assert.ok(doc.output().includes('No recorded activity'));
  assert.ok(doc.output().includes('0 entries'));
});

test('filter summary wraps above repeated table headers without clipping records', () => {
  const model = report(45);
  model.filters = `Search: ${'long-search '.repeat(10)} | All entities | 28 Aug 2026 - 3 Sep 2026 (Malaysia) | Oldest first`;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: false });
  const calls = [], original = doc.text.bind(doc);
  doc.text = (value, x, y, ...args) => {
    calls.push({ value: String(value), x, y, page: doc.getCurrentPageInfo().pageNumber });
    return original(value, x, y, ...args);
  };
  pdf.renderAuditLogPdf(doc, model);
  assert.ok(calls.some(call => call.value.includes('Oldest first')));
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    const pageCalls = calls.filter(call => call.page === page);
    const header = pageCalls.find(call => call.value === 'When');
    const summary = pageCalls.filter(call => /long-search|Oldest first|All entities/.test(call.value));
    assert.ok(summary.length >= 2);
    assert.ok(summary.every(call => call.y < header.y - 10));
    assert.ok(pageCalls.every(call => call.x >= 24 && call.y <= 580));
  }
  assert.ok(doc.output().includes('Vendor Update 44'));
});

test('oversized audit rows continue without clipped or missing tail text', () => {
  const model = report(2);
  model.rows[0].action = `${'Long audit action '.repeat(600)}END LONG ACTION`;
  model.rows[1].entity = 'vendor · FINAL-ENTITY';
  assert.equal(typeof pdf.renderAuditLogPdf, 'function');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const original = doc.text.bind(doc), outside = [];
  doc.text = (value, x, y, ...rest) => {
    if (x < 24 || x > 818 || y < 20 || y > 580) outside.push({ value, x, y });
    return original(value, x, y, ...rest);
  };
  pdf.renderAuditLogPdf(doc, model);
  assert.deepEqual(outside, []);
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(doc.output().includes('END LONG ACTION'));
  assert.ok(doc.output().includes('FINAL-ENTITY'));
});

test('embedded Unicode text keeps mixed-script runs and trailing content across pages', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => new Response(await readFile(new URL(`../../public${url}`, import.meta.url))));
  const model = report(2);
  model.rows[0].action = `${'审核 马六甲 Café Ş '.repeat(450)}END UNICODE ACTION`;
  model.rows[1].entity = 'FINAL UNICODE ROW';
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', putOnlyUsedFonts: true });
  await installDashboardFonts(doc, model);
  const text = [], outside = [], original = doc.text.bind(doc);
  doc.text = (value, x, y, ...rest) => {
    text.push(String(value));
    if (x < 24 || x > 818 || y < 20 || y > 580) outside.push({ value, x, y });
    return original(value, x, y, ...rest);
  };
  pdf.renderAuditLogPdf(doc, model);
  const joined = text.join('');
  for (const label of ['审核', '马六甲', 'Café Ş', 'FINAL UNICODE ROW']) assert.ok(joined.includes(label), label);
  assert.ok(joined.replace(/\s/g, '').includes('ENDUNICODEACTION'));
  assert.deepEqual(outside, []);
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});
