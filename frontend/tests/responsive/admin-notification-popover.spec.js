import { expect, test } from "@playwright/test";

const dashboardPayload = {
  stats: [],
  kpis: [],
  vendorTrend: [],
  statusBreakdown: [],
  categoryBreakdown: [],
  sourceBreakdown: [],
  aiPipeline: [],
  recentVendors: [],
  recentProcessing: [],
  attentionItems: [
    { id: "drafts", label: "Draft vendors waiting for approval", value: 12, href: "/admin/vendors2", tone: "warning" },
    { id: "reviews", label: "Hidden reviews to revisit", value: 3, href: "/admin/reviews", tone: "danger" },
  ],
};

async function stubAdminApi(page) {
  await page.route("http://localhost:4000/api/admin/dashboard", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboardPayload) })
  );
  await page.route("http://localhost:4000/api/admin/appeals/pending-count", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) })
  );
}

test("admin bell opens the notification popover and item links remain actionable", async ({ page }) => {
  await stubAdminApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin", { waitUntil: "networkidle" });

  await expect(page.locator(".admin-nav")).not.toContainText("Notifications");
  const bell = page.getByRole("button", { name: "Notifications" });
  await expect(bell).toHaveAttribute("aria-expanded", "false");
  await bell.click();

  const popover = page.getByRole("dialog", { name: "Admin notifications" });
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Draft vendors waiting for approval");
  await expect(popover).toContainText("Hidden reviews to revisit");
  await expect(bell).toHaveAttribute("aria-expanded", "true");

  await popover.getByRole("link", { name: /Draft vendors waiting for approval/ }).click();
  await expect(page).toHaveURL(/\/admin\/vendors2$/);
  await expect(page.getByRole("dialog", { name: "Admin notifications" })).toHaveCount(0);
});

test("legacy notification URL redirects back to the admin dashboard", async ({ page }) => {
  await stubAdminApi(page);
  await page.goto("/admin/notifications", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/admin$/);
});

test("admin notification popover stays within a narrow viewport", async ({ page }) => {
  await stubAdminApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Notifications" }).click();

  const popover = page.getByRole("dialog", { name: "Admin notifications" });
  const box = await popover.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});
