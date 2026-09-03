import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API = url => new URL(url).pathname.startsWith('/api/');
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

async function setup(page, { width = 1440, gateExport = false, gateSearch = false, gateSearchPageSize = 10, failSearch = false } = {}) {
  const calls = [];
  let releaseExport, releaseSearch, resolveSearchSettled;
  const exportGate = new Promise(resolve => { releaseExport = resolve; });
  const searchGate = new Promise(resolve => { releaseSearch = resolve; });
  const searchSettled = new Promise(resolve => { resolveSearchSettled = resolve; });
  let searchFailurePending = failSearch;
  await page.clock.setFixedTime(new Date('2026-09-03T04:00:00Z'));
  await page.setViewportSize({ width, height: 1000 });
  await page.route(API, async route => {
    if (!['GET', 'OPTIONS'].includes(route.request().method())) {
      throw new Error('Audit layout fixtures must never mutate data');
    }
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/me/activity') {
      const query = Object.fromEntries(url.searchParams);
      calls.push(query);
      if (gateExport && query.pageSize === '100' && query.page === '1') await exportGate;
      if (gateSearch && query.q === 'vendor' && query.pageSize === String(gateSearchPageSize)) await searchGate;
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
        if (gateSearch && query.q === 'vendor' && query.pageSize === String(gateSearchPageSize)) resolveSearchSettled();
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
  await page.evaluate(() => document.fonts.ready);
  return { calls, releaseExport, releaseSearch, searchSettled };
}

const search = page => page.getByRole('searchbox', { name: /search/i });
const entity = page => page.getByRole('combobox', { name: 'Entity', exact: true });
const period = page => page.getByRole('combobox', { name: 'Time range', exact: true });
const sort = page => page.getByRole('combobox', { name: 'Sort order', exact: true });
const exportButton = page => page.getByRole('button', { name: 'Export PDF', exact: true });

test('audit pagination reports the filtered range and Rows preserves current filters', async ({ page }) => {
  const state = await setup(page);
  const rows = page.getByRole('combobox', { name: 'Rows', exact: true });
  const meta = page.locator('.admin-pagination-meta');

  await expect(rows).toHaveValue('10');
  await expect(meta).toHaveText('Showing 1–10 of 170 entries');
  await expect(page.getByText('Page 1 / 17', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(meta).toHaveText('Showing 11–20 of 170 entries');

  await entity(page).selectOption('vendor');
  await sort(page).selectOption('oldest');
  await expect(meta).toHaveText('Showing 1–10 of 150 entries');
  await rows.selectOption('25');
  await expect(rows).toHaveValue('25');
  await expect(meta).toHaveText('Showing 1–25 of 150 entries');
  await expect(page.getByText('Page 1 / 6', { exact: true })).toBeVisible();
  expect(state.calls.at(-1)).toMatchObject({ entity: 'vendor', sort: 'oldest', page: '1', pageSize: '25' });

  await rows.selectOption('50');
  await expect(meta).toHaveText('Showing 1–50 of 150 entries');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(meta).toHaveText('Showing 51–100 of 150 entries');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(meta).toHaveText('Showing 101–150 of 150 entries');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 400, height: 1000 });
  await mkdir(resolve('responsive-output/my-audit-log-filters'), { recursive: true });
  await page.locator('.admin-pagination').screenshot({ path: resolve('responsive-output/my-audit-log-filters/audit-pagination-mobile.png') });
});

test('Rows changed before a pending search debounce is retained by its request and results', async ({ page }) => {
  const state = await setup(page);
  const rows = page.getByRole('combobox', { name: 'Rows', exact: true });
  await page.clock.pauseAt(new Date('2026-09-03T04:00:00Z'));
  await search(page).fill('vendor');
  await rows.selectOption('50');
  await page.clock.runFor(350);
  await expect.poll(() => state.calls.some(call => call.q === 'vendor' && call.pageSize === '50')).toBeTruthy();
  await expect(page.locator('.admin-pagination-meta')).toHaveText('Showing 1–50 of 150 entries');
  await expect(rows).toHaveValue('50');
});

test('audit mobile fix preserves desktop baseline with and without Clear filters', async ({ page }) => {
  await setup(page);
  const actual = {};
  for (const width of [768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    actual[width] = {};
    for (const value of ['all', 'suspension_appeal']) {
      await entity(page).selectOption(value);
      await expect(exportButton(page)).toBeEnabled();
      actual[width][value] = await page.locator('.admin-audit-log-toolbar').evaluate(toolbar =>
        [...toolbar.querySelectorAll('input, select, button')].map(element => {
          const box = element.getBoundingClientRect(), css = getComputedStyle(element);
          return { tag: element.tagName, label: element.getAttribute('aria-label') || element.textContent,
            x: box.x, y: box.y, width: box.width, height: box.height,
            style: Object.fromEntries(['fontSize', 'fontWeight', 'lineHeight', 'paddingLeft', 'paddingRight', 'textAlign', 'textAlignLast', 'borderRadius', 'boxShadow'].map(key => [key, css[key]])) };
        })
      );
    }
  }
  const path = resolve('tests/responsive/my-audit-log-mobile-baseline.json');
  if (process.env.CAPTURE_AUDIT_MOBILE_BASELINE) {
    // Initial capture only; never silently replace the pre-fix baseline.
    await writeFile(path, JSON.stringify(actual, null, 2) + '\n', { flag: 'wx' });
  } else {
    expect(actual).toEqual(JSON.parse(await readFile(path, 'utf8')));
  }
});

async function expectPhonePairs(page) {
  const fields = [entity(page), period(page), sort(page), page.getByRole('button', { name: /Export PDF|Preparing PDF/ })];
  const boxes = await Promise.all(fields.map(field => field.boundingBox()));
  const searchBox = await search(page).locator('..').boundingBox();
  expect(searchBox.height).toBe(52);
  for (const [left, right] of [[boxes[0], boxes[1]], [boxes[2], boxes[3]]]) {
    expect(left.width).toBeCloseTo(right.width, 0);
    expect(left.y).toBeCloseTo(right.y, 0);
    expect(right.x - left.x - left.width).toBeCloseTo(12, 0);
    expect(left.x).toBeCloseTo(searchBox.x, 0);
    expect(right.x + right.width).toBeCloseTo(searchBox.x + searchBox.width, 0);
  }
  expect(boxes[0].y - searchBox.y - searchBox.height).toBeCloseTo(12, 0);
  expect(boxes[2].y - boxes[0].y - boxes[0].height).toBeCloseTo(12, 0);
  for (let i = 0; i < fields.length; i++) {
    expect(boxes[i].height).toBe(52);
    await expect(fields[i]).toHaveCSS('font-size', '14px');
  }
  for (const select of fields.slice(0, 3)) {
    await expect(select).toHaveCSS('text-align', 'center');
    await expect(select).toHaveCSS('text-align-last', 'center');
    const spacing = await select.evaluate(element => {
      const css = getComputedStyle(element), box = element.getBoundingClientRect();
      const arrow = element.parentElement.querySelector('svg').getBoundingClientRect();
      const context = document.createElement('canvas').getContext('2d');
      context.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const labelWidth = Math.min(context.measureText(element.selectedOptions[0].text).width,
        element.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight));
      return { left: css.paddingLeft, right: css.paddingRight, labelRight: box.x + box.width / 2 + labelWidth / 2, arrowLeft: arrow.x };
    });
    expect(spacing.left).toBe(spacing.right);
    expect(spacing.labelRight + 2).toBeLessThanOrEqual(spacing.arrowLeft);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 430, 767]) {
  test(`audit phone toolbar has centered equal pairs at ${width}px including active filters`, async ({ page }) => {
    await setup(page, { width });
    await expectPhonePairs(page);
    await mkdir(resolve('responsive-output/my-audit-log-filters'), { recursive: true });
    await page.screenshot({ path: resolve(`responsive-output/my-audit-log-filters/centered-${width}.png`), fullPage: true });
    await entity(page).selectOption('suspension_appeal');
    await expect(exportButton(page)).toBeEnabled();
    await expectPhonePairs(page);
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
    const clearBox = await clear.boundingBox(), searchBox = await search(page).locator('..').boundingBox(), sortBox = await sort(page).boundingBox();
    expect(clearBox.width).toBeCloseTo(searchBox.width, 0);
    expect(clearBox.x).toBeCloseTo(searchBox.x, 0);
    expect(clearBox.height).toBe(52);
    expect(clearBox.y - sortBox.y - sortBox.height).toBeCloseTo(12, 0);
    await search(page).focus();
    for (const field of [entity(page), period(page), sort(page), exportButton(page), clear]) {
      await page.keyboard.press('Tab');
      await expect(field).toBeFocused();
    }
    await clear.click();
    await expect(clear).toHaveCount(0);
    await expectPhonePairs(page);
  });
}

test('audit responsive action order preserves active filters and native keyboard order', async ({ page }) => {
  await setup(page, { width: 1280 });
  await entity(page).selectOption('vendor');
  await sort(page).selectOption('oldest');
  await expect(exportButton(page)).toBeEnabled();
  const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
  for (const width of [1280, 390, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const actionOrder = width < 768 ? ['Export PDF', 'Clear filters'] : ['Clear filters', 'Export PDF'];
    await expect.poll(() => page.locator('.admin-audit-log-toolbar button').allTextContents()).toEqual(actionOrder);
    await expect(entity(page)).toHaveValue('vendor');
    await expect(sort(page)).toHaveValue('oldest');
    await search(page).focus();
    for (const control of [entity(page), period(page), sort(page), ...(width < 768 ? [exportButton(page), clear] : [clear, exportButton(page)])]) {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
    }
    await expect(page.locator('.admin-audit-log-toolbar button')).toHaveCount(2);
  }
});

test('audit phone pending export stays in its half-width cell at 320px', async ({ page }) => {
  const state = await setup(page, { width: 320, gateExport: true });
  const popupPromise = page.waitForEvent('popup');
  await exportButton(page).click();
  const popup = await popupPromise;
  try {
    const pending = page.getByRole('button', { name: 'Preparing PDF…', exact: true });
    await expect(pending).toBeDisabled();
    await expectPhonePairs(page);
    const contained = await pending.evaluate(button => {
      const box = button.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(button.querySelector('span') || button);
      return [...range.getClientRects()].every(rect => rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom);
    });
    expect(contained).toBe(true);
  } finally {
    state.releaseExport();
  }
  await expect(exportButton(page)).toBeEnabled();
  await popup.close();
});

test('combines filters on the whole dataset, resets page, sorts and clears', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 / 17', { exact: true })).toBeVisible();
  await search(page).fill('vendor');
  await expect(exportButton(page)).toBeDisabled();
  await entity(page).selectOption('vendor');
  await period(page).selectOption('7d');
  await sort(page).selectOption('oldest');
  await expect(exportButton(page)).toBeEnabled();
  await expect(page.getByText('Page 1 / 13', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText(UUID);
  const latest = state.calls.filter(call => call.pageSize === '10').at(-1);
  expect(latest).toMatchObject({ q: 'vendor', entity: 'vendor', sort: 'oldest', page: '1', from: '2026-08-27T16:00:00.000Z', to: '2026-09-03T16:00:00.000Z' });
  await expect(page.locator('.admin-vendors-page')).toContainText('130');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(search(page)).toHaveValue('');
  await expect(entity(page)).toHaveValue('all');
  await expect(period(page)).toHaveValue('all');
  await expect(sort(page)).toHaveValue('newest');
  await expect(page.getByText('Page 1 / 17', { exact: true })).toBeVisible();
});

test('exports all matching rows in a fixed query even if filters change during preparation', async ({ page }) => {
  const state = await setup(page, { gateExport: true });
  await search(page).fill('vendor');
  await entity(page).selectOption('vendor');
  await period(page).selectOption('7d');
  await sort(page).selectOption('oldest');
  await expect(exportButton(page)).toBeEnabled();
  await page.getByRole('combobox', { name: 'Rows', exact: true }).selectOption('25');
  await expect(page.getByText('Page 1 / 6', { exact: true })).toBeVisible();
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
  await expect(page.getByText('No activity matches your filters.')).toHaveCount(0);
  await expect(exportButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(search(page)).toHaveValue('broken');
  await expect(exportButton(page)).toBeEnabled();
  expect(state.calls.filter(call => call.q === 'broken' && call.pageSize === '10')).toHaveLength(2);
});

test('full entity UUID search and empty filtered result are clearable', async ({ page }) => {
  await setup(page);
  await search(page).fill(UUID);
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('cell', { name: `vendor · ${UUID}`, exact: true })).toBeVisible();
  await expect(page.getByText('Showing 1–1 of 1 entry', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await search(page).fill('unmatched result');
  await expect(page.getByText(/No activity matches/)).toBeVisible();
  await expect(page.getByText('Showing 0–0 of 0 entries', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(exportButton(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(11);
});

test('limits a pasted search to the visible 100-character query sent to list and export', async ({ page }) => {
  const state = await setup(page);
  const pasted = 'v'.repeat(120);
  const canonical = pasted.slice(0, 100);
  await search(page).fill(pasted);
  await expect(search(page)).toHaveValue(canonical);
  await expect(exportButton(page)).toBeEnabled();
  const listCall = state.calls.filter(call => call.pageSize === '10').at(-1);
  expect(listCall.q).toBe(canonical);
  const popupPromise = page.waitForEvent('popup');
  await exportButton(page).click();
  const popup = await popupPromise;
  await expect.poll(() => state.calls.some(call => call.pageSize === '100')).toBeTruthy();
  expect(state.calls.filter(call => call.pageSize === '100').every(call => call.q === canonical)).toBeTruthy();
  await popup.close();
});

test('mobile filter controls wrap without horizontal overflow', async ({ page }) => {
  await setup(page, { width: 390 });
  for (const control of [search(page), entity(page), period(page), sort(page), exportButton(page)]) await expect(control).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await mkdir(resolve('responsive-output/my-audit-log-filters'), { recursive: true });
  await page.screenshot({ path: resolve('responsive-output/my-audit-log-filters/mobile.png'), fullPage: true });
});

for (const width of [320, 768, 1024, 1280]) {
  test(`filter controls remain in bounds with Clear filters at ${width}px`, async ({ page }) => {
    await setup(page, { width });
    await entity(page).selectOption('suspension_appeal');
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
    await expect(clear).toBeVisible();
    for (const control of [search(page), entity(page), period(page), sort(page), clear, exportButton(page)]) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(width < 1024 ? 44 : 20);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await clear.click();
    await expect(entity(page)).toHaveValue('all');
  });
}

test('audit toolbar matches Vendors control sizing, typography and alignment', async ({ page }) => {
  await setup(page, { width: 1920 });
  const controlStyle = locator => locator.evaluate(element => {
    const style = getComputedStyle(element);
    return Object.fromEntries(['height', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderColor', 'borderRadius', 'paddingLeft', 'paddingRight', 'boxShadow'].map(key => [key, style[key]]));
  });
  const textStyle = locator => locator.evaluate(element => {
    const style = getComputedStyle(element);
    const placeholder = getComputedStyle(element, '::placeholder');
    return { size: style.fontSize, weight: style.fontWeight, color: style.color, placeholder: placeholder.color };
  });
  const audit = {
    select: await controlStyle(entity(page)),
    export: await controlStyle(exportButton(page)),
    search: await textStyle(search(page)),
  };
  const boxes = await Promise.all([search(page).locator('..'), entity(page), period(page), sort(page), exportButton(page)].map(control => control.boundingBox()));
  // Measure before navigating, so failures show the actual toolbar mismatch.
  for (const box of boxes) {
    expect.soft(box.height).toBe(40);
    expect.soft(box.y).toBeCloseTo(boxes[0].y, 0);
  }
  expect.soft(boxes[0].width).toBeLessThanOrEqual(672);
  await mkdir(resolve('responsive-output/my-audit-log-filters'), { recursive: true });
  await page.locator('.admin-audit-log-toolbar').screenshot({ path: resolve('responsive-output/my-audit-log-filters/audit-toolbar.png') });
  await page.route('**/api/admin/vendors?*', route => route.fulfill({ json: {
    items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  } }));
  await page.route('**/api/admin/vendors/duplicates', route => route.fulfill({ json: { groups: [] } }));
  await page.goto('/admin/vendors2');
  const vendorCategory = page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'All Categories', exact: true }) });
  await expect(vendorCategory).toBeVisible();
  expect.soft(audit.select).toEqual(await controlStyle(vendorCategory));
  expect.soft(audit.export).toEqual(await controlStyle(exportButton(page)));
  expect.soft(audit.search).toEqual(await textStyle(page.getByPlaceholder('Search Vendors, Categories, Dishes…')));
});
