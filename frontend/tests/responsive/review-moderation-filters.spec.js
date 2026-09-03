import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const API = /^https?:\/\/(?:localhost|127\.0\.0\.1):4000\/api\//;
const search = page => page.getByPlaceholder('Search reviews, vendors, authors…');
const visibility = page => page.getByRole('combobox');

async function setup(page, width = 1440) {
  const calls = [];
  const changes = [];
  const reviews = Array.from({ length: 24 }, (_, index) => ({
    id: `review-${index}`, vendorId: `vendor-${index}`, vendorName: `Cafe ${index}`,
    authorName: `Reviewer ${index}`, rating: 4, body: `Tasty dish ${index}`,
    isHidden: index % 2 === 1, hiddenReason: index % 2 === 1 ? 'admin' : null,
    createdAt: '2026-09-03T04:00:00.000Z',
  }));
  await page.setViewportSize({ width, height: 900 });
  await page.route(API, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/admin/reviews') {
      const query = Object.fromEntries(url.searchParams);
      calls.push(query);
      const matches = reviews.filter(review => query.visibility === 'all' || review.isHidden === (query.visibility === 'hidden'));
      const pageNumber = Number(query.page), pageSize = Number(query.pageSize);
      await route.fulfill({ json: { items: matches.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        pagination: { page: pageNumber, pageSize, total: matches.length, totalPages: Math.max(1, Math.ceil(matches.length / pageSize)) } } });
      return;
    }
    if (request.method() === 'PATCH' && /\/reviews\/review-\d+\/visibility$/.test(url.pathname)) {
      const id = url.pathname.split('/').at(-2);
      const body = request.postDataJSON();
      changes.push({ id, ...body });
      const review = reviews.find(row => row.id === id);
      review.isHidden = body.is_hidden;
      review.hiddenReason = body.is_hidden ? 'admin' : null;
      await route.fulfill({ json: { id, isHidden: body.is_hidden } });
      return;
    }
    if (url.pathname === '/api/admin/me/activity') {
      await route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } } });
      return;
    }
    await route.fulfill({ json: url.pathname.endsWith('pending-count') ? { count: 0 } : {} });
  });
  await page.goto('/admin/reviews');
  await expect(page.getByRole('row')).toHaveCount(11);
  return { calls, changes };
}

async function styleOf(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    const keys = ['height', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderColor', 'borderRadius', 'paddingLeft', 'paddingRight', 'boxShadow'];
    return { ...Object.fromEntries(keys.map(key => [key, style[key]])), placeholder: getComputedStyle(element, '::placeholder').color };
  });
}

for (const width of [1440, 390]) {
  test(`review and audit filters share typography and preserve intended sizing at ${width}px`, async ({ page }) => {
    await setup(page, width);
    const reviewStyles = {
      search: await styleOf(search(page)),
      wrapper: await styleOf(search(page).locator('..')),
      select: await styleOf(visibility(page)),
    };
    await page.goto('/admin/audit-log');
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
    const auditSearch = page.getByRole('searchbox', { name: 'Search', exact: true });
    expect.soft(reviewStyles.search).toEqual(await styleOf(auditSearch));
    const auditWrapper = await styleOf(auditSearch.locator('..'));
    const auditSelect = await styleOf(page.getByRole('combobox', { name: 'Entity', exact: true }));
    if (width < 768) {
      // Audit now opts into Vendors' 52px paired phone layout. Review is outside
      // that change: pin its existing dimensions while comparing all other styles.
      expect.soft(auditWrapper.height).toBe('52px');
      expect.soft(auditSelect).toMatchObject({ height: '52px', paddingLeft: '20px', paddingRight: '20px' });
      expect.soft(reviewStyles.wrapper).toEqual({ ...auditWrapper, height: '46px' });
      expect.soft(reviewStyles.select).toEqual({ ...auditSelect, height: '44px', paddingLeft: '16px', paddingRight: '40px' });
    } else {
      expect.soft(reviewStyles.wrapper).toEqual(auditWrapper);
      expect.soft(reviewStyles.select).toEqual(auditSelect);
    }
  });
}

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`review controls stay aligned and in bounds at ${width}px`, async ({ page }) => {
    await setup(page, width);
    await expect(search(page)).toHaveAccessibleName('Search reviews');
    await expect(visibility(page)).toHaveAccessibleName('Review visibility');
    const [searchBox, filterBox] = await Promise.all([search(page).locator('..').boundingBox(), visibility(page).boundingBox()]);
    for (const box of [searchBox, filterBox]) {
      if (width < 1024) expect(box.height).toBeGreaterThanOrEqual(44);
      else expect(box.height).toBe(40);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    if (width >= 1280) {
      expect(filterBox.y).toBeCloseTo(searchBox.y, 0);
      expect(searchBox.width).toBeLessThanOrEqual(672);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (width === 390 || width === 1440) {
      await mkdir(resolve('responsive-output/review-moderation-filters'), { recursive: true });
      await page.screenshot({ path: resolve(`responsive-output/review-moderation-filters/${width}.png`), fullPage: true });
    }
  });
}

test('search still matches vendor, author and body and clears selections', async ({ page }) => {
  const { calls } = await setup(page);
  await page.getByRole('checkbox', { name: 'Select review by Reviewer 0', exact: true }).check();
  await expect(page.getByRole('region', { name: 'Review batch actions' })).toBeVisible();
  for (const query of ['  CAFE 2  ', 'Reviewer 2', 'Tasty dish 2']) {
    await search(page).fill(query);
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('row').nth(1)).toContainText('Reviewer 2');
  }
  await expect(page.getByRole('region', { name: 'Review batch actions' })).toHaveCount(0);
  await search(page).fill('No such review');
  await expect(page.getByText('No reviews matched this filter.')).toBeVisible();
  await search(page).fill('');
  await expect(page.getByRole('row')).toHaveCount(11);
  expect(calls).toHaveLength(1); // This presentation fix does not change the existing current-page search.
});

test('visibility resets pagination and selection while hide/unhide still requires confirmation', async ({ page }) => {
  const { calls, changes } = await setup(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 / 3', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select all reviews on this page', exact: true }).check();
  await visibility(page).selectOption('visible');
  await expect(page.getByText('Page 1 / 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Review batch actions' })).toHaveCount(0);
  expect(calls.at(-1)).toMatchObject({ page: '1', pageSize: '10', visibility: 'visible' });
  await page.getByRole('row').filter({ hasText: 'Reviewer 0' }).getByRole('button', { name: 'Hide review', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(changes).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Hide review', exact: true }).click();
  await expect.poll(() => changes.length).toBe(1);
  expect(changes[0]).toEqual({ id: 'review-0', is_hidden: true });
  await expect(page.getByRole('cell', { name: 'Reviewer 0', exact: true })).toHaveCount(0);
  await visibility(page).selectOption('hidden');
  const hidden = page.getByRole('row').filter({ hasText: 'Reviewer 0' });
  await hidden.getByRole('button', { name: 'Unhide review', exact: true }).click();
  await dialog.getByRole('button', { name: 'Unhide review', exact: true }).click();
  await expect.poll(() => changes.length).toBe(2);
  expect(changes[1]).toEqual({ id: 'review-0', is_hidden: false });
  await expect(page.getByRole('cell', { name: 'Reviewer 0', exact: true })).toHaveCount(0);
});
