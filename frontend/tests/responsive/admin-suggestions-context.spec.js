import { expect, test } from "@playwright/test";

const longContext = "Zheng He Tea House, Kampung Kuli Street, Central Melaka, Malacca City, Malacca, 75100, Malaysia";

test("admin suggestion context stays bounded while preserving the full value", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("http://localhost:4000/api/admin/dashboard", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ attentionItems: [] }),
  }));
  await page.route("http://localhost:4000/api/admin/appeals/pending-count", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ count: 0 }),
  }));
  await page.route("http://localhost:4000/api/admin/suggestions?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      suggestions: [{
        id: "suggestion-long-context",
        suggestion_type: "vendor",
        vendor_name: "Zheng He Tea House",
        category: "Vendor",
        location_text: longContext,
        source_platform: "TikTok",
        source_kind: "video",
        status: "submitted",
        created_at: "2026-08-27T00:00:00.000Z",
      }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    }),
  }));

  await page.goto("/admin/suggestions", { waitUntil: "networkidle" });
  const row = page.locator("tbody tr").filter({ hasText: "Zheng He Tea House" });
  await expect(row).toBeVisible();

  const context = row.locator("td").nth(2).locator("div");
  await expect(context).toHaveAttribute("title", longContext);
  const metrics = await context.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { width: rect.width, overflow: style.overflow, textOverflow: style.textOverflow };
  });
  expect(metrics.width).toBeLessThanOrEqual(448);
  expect(metrics.overflow).toBe("hidden");
  expect(metrics.textOverflow).toBe("ellipsis");
});
