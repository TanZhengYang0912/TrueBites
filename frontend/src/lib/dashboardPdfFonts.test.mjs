import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { buildDashboardReport } from './dashboardReport.js';
import { renderDashboardPdf } from './dashboardPdf.js';

import * as fonts from './dashboardPdfFonts.js';

test('font loading is local, retryable, and covers Latin plus Chinese text', async (t) => {
  assert.equal(typeof fonts.installDashboardFonts, 'function');
  const model = buildDashboardReport({ recentVendors: [{ name: '马六甲 Café ş', status: 'ACTIVE' }] });
  const requested = [];
  let fail = true;
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(String(url));
    if (fail) return new Response('', { status: 503 });
    return new Response(await readFile(new URL(`../../public${url}`, import.meta.url)));
  });
  await assert.rejects(fonts.installDashboardFonts(new jsPDF(), model), /font/i);
  fail = false;
  const doc = new jsPDF();
  await fonts.installDashboardFonts(doc, model);
  assert.ok(doc.getFontList().DashboardSans.includes('normal'));
  assert.ok(doc.getFontList().DashboardSans.includes('bold'));
  assert.ok(doc.getFontList().DashboardCjk.includes('normal'));
  doc.setFont('DashboardSans', 'normal');
  assert.ok(doc.getFont().metadata.characterToGlyph('ş'.codePointAt(0)));
  doc.setFont('DashboardCjk', 'normal');
  assert.ok(doc.getFont().metadata.characterToGlyph('马'.codePointAt(0)));
  assert.ok(requested.every((url) => /^\/fonts\/dashboard\/[\w-]+\.ttf$/.test(url)));
  assert.doesNotThrow(() => renderDashboardPdf(doc, model), 'mixed CJK and extended Latin names must render without losing glyphs');
});
