import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API = /^https?:\/\/(?:localhost|127\.0\.0\.1):4000\/api\//;
const UUID = '13cce62a-3e44-47a1-87cb-111111111111';
const entries = Array.from({ length: 170 }, (_, i) => ({
  id: `audit-${String(i).padStart(3, '0')}`,
  createdAt: new Date(Date.UTC(2026, i < 150 ? 8 : 7, 3, 0, i)).toISOString(),
  action: i < 130 || i >= 150 ? 'vendor.update' : 'review.hide',
  entityType: i < 130 || i >= 150 ? 'vendor' : 'review',
  entityId: i === 0 ? UUID : `entity-${String(i).padStart(3, '0')}`,
  metadata: { token: 'PRIVATE_FILTER_SENTINEL' },
}));

function filtered(params) {
  const q = (params.get('q') || '').toLowerCase();
  const matches = entries.filter(row => (
    (!q || row.action.includes(q) || row.entityType.includes(q) || row.entityId === q)
    && (!params.get('entity') || params.get('entity') === 'all' || row.entityType === params.get('entity'))
    && (!params.get('from') || row.createdAt >= params.get('from'))
    && (!params.get('to') || row.createdAt < params.get('to'))
  ));
  return matches.sort((a, b) => {
    const time = a.createdAt.localeCompare(b.createdAt);
    return (params.get('sort') === 'oldest' ? time : -time) || a.id.localeCompare(b.id);
  });
}

async function setup(page, { width = 1440, gateExport = false, gateSearch = false, failSearch = false } = {}) {
  const calls = [];
  let releaseExport, releaseSearch, resolveSearchSettled;
  const exportGate = new Promise(resolve => { releaseExport = resolve; });
  const searchGate = new Promise(resolve => { releaseSearch = resolve; });
  const searchSettled = new Promise(resolve => { resolveSearchSettled = resolve; });
  let searchFailurePending = failSearch;
  await page.clock.setFixedTime(new Date('2026-09-03T04:00:00Z'));
  await page.setViewportSize({ width, height: 1000 });
  await page.route(API, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/me/activity') {
      const query = Object.fromEntries(url.searchParams);
      calls.push(query);
      if (gateExport && query.pageSize === '100' && query.page === '1') await exportGate;
      if (gateSearch && query.q === 'vendor' && query.pageSize === '25') await searchGate;
      if (searchFailurePending && query.q === 'broken') {
        searchFailurePending = false;
        await route.fulfill({ status: 500, json: { error: 'Temporary audit failure' } });
        return;
      }
      const matches = filtered(url.searchParams);
      const pageNumber = Number(query.page), pageSize = Number(query.pageSize);
      await route.fulfill({ json: {
        items: matches.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        pagination: { page: pageNumber, pageSize, total: matches.length, totalPages: Math.max(1, Math.ceil(matches.length / pageSize)) },
      } }).catch(error => { if (!/closed|disposed|invalid interception/i.test(error.message)) throw error; }).finally(() => {
        if (gateSearch && query.q === 'vendor' && query.pageSize === '25') resolveSearchSettled();
      });
      return;
    }
    await route.fulfill({ json: url.pathname.endsWith('pending-count') ? { count: 0 } : {} });
  });
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type === 'application/pdf') blob.arrayBuffer().then(buffer => { window.__filterPdf = Array.from(new Uint8Array(buffer)); });
      return create(blob);
    };
  });
  await page.goto('/admin/audit-log');
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  return { calls, releaseExport, releaseSearch, searchSettled };
}

const search = page => page.getByRole('searchbox', { name: /search/i });
const entity = page => page.getByRole('combobox', { name: 'Entity', exact: true });
const period = page => page.getByRole('combobox', { name: 'Time range', exact: true });
const sort = page => page.getByRole('combobox', { name: 'Sort order', exact: true });
const exportButton = page => page.getByRole('button', { name: 'Export PDF', exact: true });

test('combines filters on the whole dataset, resets page, sorts and clears', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 / 7', { exact: true })).toBeVisible();
  await search(page).fill('vendor');
  await expect(exportButton(page)).toBeDisabled();
  await entity(page).selectOption('vendor');
  await period(page).selectOption('7d');
  await sort(page).selectOption('oldest');
  await expect(exportButton(page)).toBeEnabled();
  await expect(page.getByText('Page 1 / 6', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText(UUID);
  const latest = state.calls.filter(call => call.pageSize === '25').at(-1);
  expect(latest).toMatchObject({ q: 'vendor', entity: 'vendor', sort: 'oldest', page: '1', from: '2026-08-27T16:00:00.000Z', to: '2026-09-03T16:00:00.000Z' });
  await expect(page.locator('.admin-vendors-page')).toContainText('130');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(search(page)).toHaveValue('');
  await expect(entity(page)).toHaveValue('all');
  await expect(period(page)).toHaveValue('all');
  await expect(sort(page)).toHaveValue('newest');
  await expect(page.getByText('Page 1 / 7', { exact: true })).toBeVisible();
});

test('exports all matching rows in a fixed query even if filters change during preparation', async ({ page }) => {
  const state = await setup(page, { gateExport: true });
  await search(page).fill('vendor');
  await entity(page).selectOption('vendor');
  await period(page).selectOption('7d');
  await sort(page).selectOption('oldest');
  await expect(exportButton(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 / 6', { exact: true })).toBeVisible();
  await mkdir(resolve('responsive-output/my-audit-log-filters'), { recursive: true });
  await page.screenshot({ path: resolve('responsive-output/my-audit-log-filters/desktop.png'), fullPage: true });
  const popupPromise = page.waitForEvent('popup');
  await exportButton(page).click();
  const popup = await popupPromise;
  await expect.poll(() => state.calls.filter(call => call.pageSize === '100').length).toBe(1);
  await entity(page).selectOption('review');
  await sort(page).selectOption('newest');
  state.releaseExport();
  await expect.poll(() => page.evaluate(() => window.__filterPdf?.length || 0)).toBeGreaterThan(1000);
  const exportCalls = state.calls.filter(call => call.pageSize === '100');
  expect(exportCalls.map(call => call.page)).toEqual(['1', '2']);
  for (const call of exportCalls) expect(call).toMatchObject({ q: 'vendor', entity: 'vendor', sort: 'oldest', from: '2026-08-27T16:00:00.000Z', to: '2026-09-03T16:00:00.000Z' });
  const bytes = Buffer.from(await page.evaluate(() => window.__filterPdf));
  expect(bytes.toString('latin1')).toContain('(130 personal audit entries)');
  expect(bytes.toString('latin1')).not.toContain('PRIVATE_FILTER_SENTINEL');
  await writeFile(resolve('responsive-output/my-audit-log-filters/filtered-oldest.pdf'), bytes);
  await popup.close();
});

test('does not let an obsolete search response replace the latest result', async ({ page }) => {
  const state = await setup(page, { gateSearch: true });
  await search(page).fill('vendor');
  await expect.poll(() => state.calls.some(call => call.q === 'vendor')).toBeTruthy();
  await search(page).fill('review');
  await expect(exportButton(page)).toBeEnabled();
  await expect(page.getByRole('row').nth(1)).toContainText('Review Hide');
  state.releaseSearch();
  await state.searchSettled;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.getByRole('row').nth(1)).toContainText('Review Hide');
  await expect(page.getByRole('cell', { name: 'Vendor Update', exact: true })).toHaveCount(0);
});

test('shows a current query error, keeps its filters, and retries that same query', async ({ page }) => {
  const state = await setup(page, { failSearch: true });
  await search(page).fill('broken');
  await expect(page.getByRole('alert')).toContainText('Temporary audit failure');
  await expect(exportButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(search(page)).toHaveValue('broken');
  await expect(exportButton(page)).toBeEnabled();
  expect(state.calls.filter(call => call.q === 'broken' && call.pageSize === '25')).toHaveLength(2);
});

test('full entity UUID search and empty filtered result are clearable', async ({ page }) => {
  await setup(page);
  await search(page).fill(UUID);
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('cell', { name: `vendor · ${UUID}`, exact: true })).toBeVisible();
  await search(page).fill('unmatched result');
  await expect(page.getByText(/No activity matches/)).toBeVisible();
  await expect(exportButton(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(26);
});

test('mobile filter controls wrap without horizontal overflow', async ({ page }) => {
  await setup(page, { width: 390 });
  for (const control of [search(page), entity(page), period(page), sort(page), exportButton(page)]) await expect(control).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await mkdir(resolve('responsive-output/my-audit-log-filters'), { recursive: true });
  await page.screenshot({ path: resolve('responsive-output/my-audit-log-filters/mobile.png'), fullPage: true });
});
