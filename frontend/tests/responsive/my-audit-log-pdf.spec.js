import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BACKEND_API = /^https?:\/\/(?:localhost|127\.0\.0\.1):4000\/api\//;

function activityEntry(index) {
  return {
    id: `audit-${index}`,
    createdAt: new Date(Date.UTC(2026, 8, 3, 12, 0, index % 60)).toISOString(),
    action: index % 2 ? 'vendor.update' : 'review_hide',
    entityType: index % 2 ? 'Vendor' : 'Review',
    entityId: `entity-${index}`,
    metadata: { privateSentinel: 'MUST NOT APPEAR' },
  };
}

function payloadFor(entries, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const start = (page - 1) * pageSize;
  return {
    items: entries.slice(start, start + pageSize),
    pagination: { page, pageSize, total: entries.length, totalPages },
  };
}

async function setup(page, options = {}) {
  const entries = options.entries || Array.from({ length: 125 }, (_, index) => activityEntry(index + 1));
  const requests = [];
  let failedExport = false;
  let releaseExportPage;
  let exportPageStarted;
  const exportPageGate = new Promise((resolve) => { releaseExportPage = resolve; });
  exportPageStarted = new Promise((resolve) => { options.onExportPageStarted = resolve; });

  await page.route(BACKEND_API, async (route) => {
    const url = new URL(route.request().url());
    requests.push({ path: url.pathname, page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') });

    if (url.pathname === '/api/admin/me/activity') {
      const requestedPage = Number(url.searchParams.get('page') || 1);
      const requestedSize = Number(url.searchParams.get('pageSize') || 25);
      if (options.failExportPage === requestedPage && requestedSize === 100 && !failedExport) {
        failedExport = true;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Export failed' }) });
      }
      if (options.gateExportPage === requestedPage && requestedSize === 100) {
        options.onExportPageStarted?.();
        await exportPageGate;
      }
      return route.fulfill({ json: payloadFor(entries, requestedPage, requestedSize) });
    }

    if (url.pathname === '/api/admin/dashboard') {
      return route.fulfill({ json: { kpis: [], vendorTrend: [], attentionItems: [], aiPipeline: [], categoryBreakdown: [], sourceBreakdown: [], recentVendors: [], recentProcessing: [] } });
    }
    if (url.pathname === '/api/admin/appeals/pending-count') {
      return route.fulfill({ json: { count: 0 } });
    }
    return route.fulfill({ json: {} });
  });

  await page.addInitScript(() => {
    const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type === 'application/pdf') {
        blob.arrayBuffer().then((data) => {
          window.__pdfBytes = Array.from(new Uint8Array(data));
        });
      }
      return nativeCreateObjectURL(blob);
    };
  });
  await page.setViewportSize(options.viewport || { width: 1440, height: 1000 });
  await page.goto('/admin/audit-log', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'My Audit Log' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'When' })).toBeVisible();
  return { entries, requests, releaseExportPage, exportPageStarted, get failedExport() { return failedExport; } };
}

async function exportedBytes(page) {
  await expect.poll(() => page.evaluate(() => window.__pdfBytes?.length || 0)).toBeGreaterThan(1000);
  return Buffer.from(await page.evaluate(() => window.__pdfBytes));
}

function activityRequests(requests, pageSize) {
  return requests.filter((request) => request.path === '/api/admin/me/activity' && Number(request.pageSize) === pageSize);
}

test('my audit log exposes an Export PDF button above the table', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeVisible();
});

test('exports every personal page from page two and captures a searchable PDF', async ({ page }) => {
  const { entries, requests } = await setup(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('cell', { name: /entity-11/ })).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const popup = await popupPromise;
  const bytes = await exportedBytes(page);

  expect(bytes.toString('latin1').startsWith('%PDF-')).toBeTruthy();
  expect(bytes.toString('latin1')).toContain('(125 personal audit entries)');
  expect(bytes.toString('latin1')).not.toContain('MUST NOT APPEAR');
  const activityPaths = requests.filter(({ path }) => path.includes('/activity'));
  expect(activityPaths.map(({ path }) => path)).toEqual([
    '/api/admin/me/activity', '/api/admin/me/activity', '/api/admin/me/activity',
    '/api/admin/me/activity',
  ]);
  expect(activityPaths.every(({ path }) => path === '/api/admin/me/activity')).toBeTruthy();
  expect(activityRequests(requests, 10).map(({ page: requestedPage }) => Number(requestedPage))).toEqual([1, 2]);
  expect(activityRequests(requests, 100).map(({ page: requestedPage }) => Number(requestedPage))).toEqual([1, 2]);
  await mkdir(resolve('responsive-output/my-audit-log-pdf'), { recursive: true });
  await writeFile(resolve('responsive-output/my-audit-log-pdf/audit-log-125.pdf'), bytes);
  await page.screenshot({ path: resolve('responsive-output/my-audit-log-pdf/audit-log-desktop.png'), fullPage: true });
  await popup.close();

  expect(entries).toHaveLength(125);
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('disables duplicate clicks while all export pages are loading', async ({ page }) => {
  const state = await setup(page, { gateExportPage: 2 });
  const button = page.locator('.admin-audit-log-toolbar button');
  const popupPromise = page.waitForEvent('popup');
  await button.click();
  const popup = await popupPromise;
  await state.exportPageStarted;
  await expect(page.getByRole('button', { name: 'Preparing PDF…', exact: true })).toBeDisabled();
  await button.dispatchEvent('click');
  expect(activityRequests(state.requests, 100)).toHaveLength(2);
  state.releaseExportPage();
  await exportedBytes(page);
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  await popup.close();
});

test('keeps the table after a page failure and retries the complete export', async ({ page }) => {
  const state = await setup(page, { failExportPage: 2 });
  const button = page.getByRole('button', { name: 'Export PDF', exact: true });
  const popupPromise = page.waitForEvent('popup');
  await button.click();
  const popup = await popupPromise;
  await expect(page.getByRole('alert')).toContainText('Could not prepare');
  await expect(page.getByRole('cell', { name: 'Vendor · entity-1', exact: true })).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBeTruthy();
  expect(activityRequests(state.requests, 100).map(({ page: requestedPage }) => Number(requestedPage))).toEqual([1, 2]);

  const retryPopupPromise = page.waitForEvent('popup');
  await button.click();
  const retryPopup = await retryPopupPromise;
  await exportedBytes(page);
  expect(activityRequests(state.requests, 100).map(({ page: requestedPage }) => Number(requestedPage))).toEqual([1, 2, 1, 2]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await retryPopup.close();
});

test('aborts a pending export when leaving the page before later pages are fetched', async ({ page }) => {
  const state = await setup(page, {
    entries: Array.from({ length: 205 }, (_, index) => activityEntry(index + 1)),
    gateExportPage: 2,
  });
  const button = page.getByRole('button', { name: 'Export PDF', exact: true });
  const popupPromise = page.waitForEvent('popup');
  await button.click();
  const popup = await popupPromise;
  await state.exportPageStarted;

  const abortedRequests = [];
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/admin/me/activity' && url.searchParams.get('pageSize') === '100') abortedRequests.push(request);
  });
  // SPA navigation exercises React cleanup, not browser document-unload abort.
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  try {
    await expect.poll(() => popup.isClosed()).toBeTruthy();
    await expect.poll(() => abortedRequests.length).toBe(1);
  } finally {
    state.releaseExportPage();
  }
  expect(activityRequests(state.requests, 100).map(({ page: requestedPage }) => Number(requestedPage))).toEqual([1, 2]);
  expect(await page.evaluate(() => window.__pdfBytes?.length || 0)).toBe(0);
});

test('reports blocked popups before fetching any export pages', async ({ page }) => {
  const state = await setup(page);
  const before = state.requests.length;
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Allow pop-ups');
  expect(state.requests.slice(before).some(({ pageSize }) => Number(pageSize) === 100)).toBeFalsy();
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
});

test('exports an empty personal log with an explicit no-data row', async ({ page }) => {
  const { requests } = await setup(page, { entries: [] });
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const popup = await popupPromise;
  const bytes = await exportedBytes(page);
  const source = bytes.toString('latin1');
  expect(source).toContain('(0 personal audit entries)');
  expect(activityRequests(requests, 100).map(({ page: requestedPage }) => Number(requestedPage))).toEqual([1]);
  await mkdir(resolve('responsive-output/my-audit-log-pdf'), { recursive: true });
  await writeFile(resolve('responsive-output/my-audit-log-pdf/audit-log-empty.pdf'), bytes);
  await page.screenshot({ path: resolve('responsive-output/my-audit-log-pdf/audit-log-empty.png'), fullPage: true });
  await popup.close();
});

test('keeps the export toolbar above the table without mobile overflow', async ({ page }) => {
  const { requests } = await setup(page, { viewport: { width: 390, height: 844 } });
  const button = page.getByRole('button', { name: 'Export PDF', exact: true });
  const table = page.locator('table.admin-table');
  const bounds = await Promise.all([button.boundingBox(), table.boundingBox()]);
  expect(bounds[0].y).toBeLessThan(bounds[1].y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const activityPaths = requests.filter(({ path }) => path.includes('/activity')).map(({ path }) => path);
  expect(activityPaths.length).toBeGreaterThan(0);
  expect(activityPaths.every((path) => path === '/api/admin/me/activity')).toBeTruthy();
  await mkdir(resolve('responsive-output/my-audit-log-pdf'), { recursive: true });
  await page.screenshot({ path: resolve('responsive-output/my-audit-log-pdf/audit-log-mobile-390.png'), fullPage: true });
});

test('right-aligns the export toolbar with the table on desktop', async ({ page }) => {
  await setup(page, { viewport: { width: 1440, height: 1000 } });
  const button = page.getByRole('button', { name: 'Export PDF', exact: true });
  const toolbar = page.locator('.admin-audit-log-toolbar');
  const table = page.locator('table.admin-table');
  const [buttonBox, toolbarBox, tableBox] = await Promise.all([button.boundingBox(), toolbar.boundingBox(), table.boundingBox()]);
  expect(buttonBox.y).toBeLessThan(tableBox.y);
  const right = (box) => box.x + box.width;
  expect(Math.abs(right(toolbarBox) - right(tableBox))).toBeLessThanOrEqual(1);
  expect(Math.abs(right(buttonBox) - right(toolbarBox))).toBeLessThanOrEqual(1);
});
