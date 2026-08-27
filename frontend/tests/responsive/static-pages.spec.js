import { expect, test } from "@playwright/test";

const routes = ["about", "terms", "guidelines", "contact", "careers"];
const viewports = [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 375, height: 812 }],
];

for (const [viewportName, viewport] of viewports) {
  for (const route of routes) {
    test(`${route} uses the shared site frame at ${viewportName}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${route}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const header = document.querySelector("header");
        const main = document.querySelector("main");
        return {
          headerHeight: header?.getBoundingClientRect().height,
          headerWidth: header?.getBoundingClientRect().width,
          mainWidth: main?.getBoundingClientRect().width,
          footerWidth: document.querySelector("footer > div")?.getBoundingClientRect().width,
          hasPrimaryNav: Boolean(document.querySelector('header nav[aria-label="Primary navigation"]')),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(metrics.headerHeight).toBeGreaterThanOrEqual(72);
      expect(metrics.headerWidth).toBeLessThanOrEqual(viewport.width);
      expect(metrics.mainWidth).toBeLessThanOrEqual(1360);
      expect(metrics.footerWidth).toBeLessThanOrEqual(1360);
      expect(metrics.hasPrimaryNav).toBe(true);
      expect(metrics.overflow).toBeLessThanOrEqual(1);
    });

    test(`${route} provides a Back to Discover link at ${viewportName}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${route}`, { waitUntil: "networkidle" });

      const backToDiscover = page.getByRole("link", { name: /Back to Discover/ });
      await expect(backToDiscover).toBeVisible();
      await expect(backToDiscover).toHaveAttribute("href", "/map");

      if (viewportName === "desktop") {
        const mainBox = await page.locator("main").boundingBox();
        const linkBox = await backToDiscover.boundingBox();
        expect(linkBox?.x).toBeGreaterThan((mainBox?.x || 0) + (mainBox?.width || 0) * 0.7);
      }
    });
  }
}
