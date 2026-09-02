import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function payload() {
  return {
    stats: [],
    kpis: [
      { key: 'totalVendors', label: 'Total vendors', value: 607, note: '300 active', tone: 'neutral' },
      { key: 'activeRate', label: 'Active rate', value: 49, suffix: '%', note: 'of all vendor records', tone: 'success' },
      { key: 'pendingDrafts', label: 'Pending drafts', value: 297, note: 'awaiting approval', tone: 'warning' },
      { key: 'aiImported', label: 'AI imported', value: 605, note: '297 still in draft', tone: 'accent' },
      { key: 'reviews', label: 'Reviews', value: 28, note: '3 hidden', tone: 'neutral' },
    ],
    vendorTrend: Array.from({ length: 90 }, (_, i) => ({
      label: new Date(Date.UTC(2026, 8, 3 - 89 + i)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      value: i === 82 ? 3 : i === 81 || i === 86 ? 1 : 0,
      active: i === 73 ? 1 : 0, draft: i === 82 ? 1 : 0,
    })),
    attentionItems: [
      { id: 'drafts', label: 'Draft vendors waiting for approval', value: 297, tone: 'warning' },
      { id: 'location', label: 'Vendors missing verified location', value: 601, tone: 'warning' },
      { id: 'hours', label: 'Vendors missing operating hours', value: 4 },
      { id: 'hidden', label: 'Hidden reviews to revisit', value: 3, tone: 'danger' },
    ],
    aiPipeline: [
      { label: 'AI imported', value: 605, tone: 'accent' }, { label: 'Needs review', value: 297, tone: 'warning' },
      { label: 'Active', value: 300, tone: 'success' }, { label: 'Needs data', value: 4, tone: 'danger' },
    ],
    categoryBreakdown: [
      { label: 'Malaysian / Local', value: 349 }, { label: 'Cafe / Dessert', value: 103 },
      { label: 'Nyonya / Peranakan', value: 99 }, { label: 'Western', value: 28 },
      { label: 'Middle Eastern', value: 16 }, { label: 'Chinese', value: 12 },
    ],
    sourceBreakdown: [{ label: 'TikTok', value: 605 }],
    recentVendors: [
      { id: 'demo-1', name: 'Demo Kopitiam', category: 'Malaysian / Local', location: 'Melaka', status: 'ACTIVE' },
      { id: 'demo-2', name: '马六甲 Café ş', category: 'Cafe / Dessert', location: 'Melaka', status: 'DRAFT' },
      { id: 'demo-3', name: 'Demo Nyonya Kitchen', category: 'Nyonya / Peranakan', location: 'Melaka', status: 'ACTIVE' },
      { id: 'demo-4', name: 'Demo Dessert House', category: 'Cafe / Dessert', location: 'Melaka', status: 'SUSPENDED' },
    ],
    recentProcessing: [
      { id: 'ai-1', vendor: 'Demo Creator Pick', platform: 'TikTok', recommendation: 'Recommended' },
      { id: 'ai-2', vendor: 'Demo Coffee House', platform: 'TikTok', recommendation: 'Highly recommended' },
    ],
    statusBreakdown: [{ label: 'SHOULD NOT APPEAR', value: 1 }],
    lastUpdated: '2026-09-02T16:01:00.000Z',
  };
}

async function setup(page, data = payload()) {
  let dashboardRequests = 0;
  // Match backend paths, not Vite's /src/api/*.js module requests.
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
    const dashboard = new URL(route.request().url()).pathname === '/api/admin/dashboard';
    if (dashboard) dashboardRequests++;
    return route.fulfill({ json: dashboard ? data : { count: 0, items: [] } });
  });
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type === 'application/pdf') blob.arrayBuffer().then((data) => { window.__pdfBytes = Array.from(new Uint8Array(data)); });
      return create(blob);
    };
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeVisible();
  return () => dashboardRequests;
}

async function exportedBytes(page) {
  await expect.poll(() => page.evaluate(() => window.__pdfBytes?.length || 0)).toBeGreaterThan(1000);
  return Buffer.from(await page.evaluate(() => window.__pdfBytes));
}

test('real dashboard PDF contains current range and is generated without refetching dashboard data', async ({ page }) => {
  const requests = await setup(page);
  const before = requests();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const popup = await popupPromise;
  const bytes = await exportedBytes(page);
  expect(bytes.toString('latin1').startsWith('%PDF-')).toBeTruthy();
  expect(bytes.toString('latin1')).toContain('(Last 30 days)');
  expect(bytes.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  expect(requests()).toBe(before);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  const directory = resolve('responsive-output/dashboard-pdf');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'dashboard-demo.pdf'), bytes);
  await page.screenshot({ path: resolve(directory, 'dashboard-demo-screen.png'), fullPage: true });
  await popup.close();
});

test('range changes during font loading do not alter the in-flight export snapshot', async ({ page }) => {
  await setup(page);
  let release;
  const gate = new Promise((resolveGate) => { release = resolveGate; });
  await page.route('**/fonts/dashboard/*.ttf', async (route) => { await gate; await route.continue(); });
  await page.getByRole('button', { name: '7d', exact: true }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const popup = await popupPromise;
  await page.getByRole('button', { name: '90d', exact: true }).click();
  await expect(page.getByText('Last 90 days', { exact: true })).toBeVisible();
  release();
  const bytes = await exportedBytes(page);
  expect(bytes.toString('latin1')).toContain('(Last 7 days)');
  expect(bytes.toString('latin1')).not.toContain('(Last 90 days)');
  await popup.close();
});

test('failed font load closes its empty popup and a retry succeeds without losing the dashboard', async ({ page }) => {
  await setup(page);
  await page.route('**/fonts/dashboard/*.ttf', (route) => route.fulfill({ status: 503, body: '' }));
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const popup = await popupPromise;
  await expect(page.getByRole('alert')).toContainText('Could not prepare');
  await expect.poll(() => popup.isClosed()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Good morning, Admin' })).toBeVisible();
  await page.unroute('**/fonts/dashboard/*.ttf');
  const retryPopupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const retry = await retryPopupPromise;
  await exportedBytes(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await retry.close();
});

test('blocked popups leave an actionable error and re-enable Export PDF', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Allow pop-ups');
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
});

test('empty dashboard still exports explicit no-data sections', async ({ page }) => {
  await setup(page, {});
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const popup = await popupPromise;
  const bytes = await exportedBytes(page);
  const directory = resolve('responsive-output/dashboard-pdf');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'dashboard-empty.pdf'), bytes);
  await popup.close();
});

test('long category labels and activity notes continue without losing their final rows', async ({ page }) => {
  const data = payload();
  data.categoryBreakdown = Array.from({ length: 15 }, (_, i) => ({ label: `Category ${i} ${'long category label '.repeat(4)}`, value: i + 1 }));
  data.recentProcessing[0].recommendation = `${'Long activity note '.repeat(220)}END OF ACTIVITY NOTE`;
  await setup(page, data);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const popup = await popupPromise;
  const bytes = await exportedBytes(page);
  expect(bytes.toString('latin1').match(/\/Type \/Page\b/g).length).toBeGreaterThan(2);
  const directory = resolve('responsive-output/dashboard-pdf');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'dashboard-long.pdf'), bytes);
  await popup.close();
});
