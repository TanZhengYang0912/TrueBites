import { expect, test } from "@playwright/test";

async function top(page, button) {
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  return Math.round(box.y);
}

test("the selected suggestion type card sits slightly below the other option", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/suggestions/new", { waitUntil: "networkidle" });

  const vendor = page.getByRole("button", { name: /A vendor/ });
  const creator = page.getByRole("button", { name: /An influencer or channel/ });
  await expect(vendor).toHaveAttribute("aria-pressed", "true");
  expect((await top(page, vendor)) - (await top(page, creator))).toBe(4);

  await creator.click();
  await expect(creator).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(220);
  expect((await top(page, creator)) - (await top(page, vendor))).toBe(4);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});
