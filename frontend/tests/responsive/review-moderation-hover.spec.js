import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function setup(page, width = 1440) {
  const writes = [];
  await page.setViewportSize({ width, height: 900 });
  // Intercept every API host: these visual tests must never mutate real reviews.
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const request = route.request();
    if (request.method() !== 'GET') writes.push(request.method());
    if (new URL(request.url()).pathname === '/api/admin/reviews') {
      await route.fulfill({ json: {
        items: [{
          id: 'hover-review', vendorId: 'hover-vendor', vendorName: 'Cafe Review Fixture',
          authorName: 'Test Reviewer', rating: 4, body: 'Oh my oh my god',
          isHidden: false, hiddenReason: null, createdAt: '2026-09-03T04:00:00.000Z',
        }],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      } });
      return;
    }
    await route.fulfill({ json: { count: 0 } });
  });
  await page.goto('/admin/reviews');
  const row = page.getByRole('row').filter({ hasText: 'Cafe Review Fixture' });
  await expect(row).toBeVisible();
  return { row, writes };
}

test('noninteractive review content uses the normal cursor, while controls remain clickable', async ({ page }) => {
  const { row, writes } = await setup(page);
  const cells = row.getByRole('cell');
  for (const index of [1, 2, 3, 4, 5]) {
    await cells.nth(index).hover();
    await expect(cells.nth(index)).toHaveCSS('cursor', 'default');
  }
  const vendorName = row.getByText('Cafe Review Fixture', { exact: true });
  await expect(vendorName).toHaveCSS('cursor', 'default');
  await vendorName.click();
  await expect(page).toHaveURL(/\/admin\/reviews$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const checkbox = row.getByRole('checkbox');
  await expect(checkbox).toHaveCSS('cursor', 'pointer');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  const hide = row.getByRole('button', { name: 'Hide review', exact: true });
  await expect(hide).toHaveCSS('cursor', 'pointer');
  await hide.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(writes).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`hovered rating keeps a full-width table cell without a white gap at ${width}px`, async ({ page }) => {
    const { row, writes } = await setup(page, width);
    const cells = row.getByRole('cell');
    const rating = cells.nth(3);
    const unhoveredBackground = await rating.evaluate(el => getComputedStyle(el).backgroundColor);
    await rating.hover();
    await mkdir(resolve('responsive-output/review-moderation-hover'), { recursive: true });
    const screenshotOptions = { path: resolve(`responsive-output/review-moderation-hover/${width}.png`), animations: 'disabled' };
    if (width >= 900) await row.screenshot(screenshotOptions);
    else await page.screenshot(screenshotOptions);

    await expect.soft(rating).toHaveCSS('display', 'table-cell');
    const [ratingBox, reviewBox] = await Promise.all([rating.boundingBox(), cells.nth(4).boundingBox()]);
    expect.soft(Math.abs(reviewBox.x - (ratingBox.x + ratingBox.width))).toBeLessThanOrEqual(1);
    const backgrounds = await cells.evaluateAll(elements => elements.map(el => getComputedStyle(el).backgroundColor));
    expect(backgrounds[3]).not.toBe(unhoveredBackground);
    expect(new Set(backgrounds).size).toBe(1);
    await expect(rating.getByText('4', { exact: true })).toBeVisible();
    await expect(rating.locator('svg')).toBeVisible();
    expect(writes).toEqual([]);
  });
}
