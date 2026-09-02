import { expect, test } from "@playwright/test";

const EMPTY_DASHBOARD = {
  kpis: [],
  stats: [],
  vendorTrend: [],
  statusBreakdown: [],
  categoryBreakdown: [],
  sourceBreakdown: [],
  aiPipeline: [],
  attentionItems: [],
  recentVendors: [],
  recentProcessing: [],
};

async function stubAdminApi(page, payload) {
  await page.route("**/api/admin/dashboard", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  }));
  await page.route("**/api/admin/appeals/pending-count", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ count: 0 }),
  }));
}

async function openDashboard(page, payload) {
  await stubAdminApi(page, payload);
  await page.goto("/admin", { waitUntil: "networkidle" });
}

test("dashboard renders the shared heading, KPIs, modules, and default range", async ({ page }) => {
  const vendorTrend = Array.from({ length: 90 }, (_, index) => ({
    label: `Day ${index + 1}`,
    value: index % 3,
    active: index % 2,
    draft: index === 89 ? 2 : 0,
  }));
  await openDashboard(page, {
    ...EMPTY_DASHBOARD,
    kpis: [
      { key: "totalVendors", label: "Total vendors", value: 123, note: "42 active", tone: "neutral" },
      { key: "activeRate", label: "Active rate", value: 42, suffix: "%", note: "of all vendor records", tone: "success" },
      { key: "pendingDrafts", label: "Pending drafts", value: 7, note: "awaiting approval", tone: "warning" },
      { key: "aiImported", label: "AI imported", value: 19, note: "7 still in draft", tone: "accent" },
      { key: "reviews", label: "Reviews", value: 4, note: "1 hidden", tone: "neutral" },
    ],
    vendorTrend,
    attentionItems: [{ id: "drafts", label: "Draft vendors", value: 7, href: "/admin/vendors2", tone: "warning" }],
    aiPipeline: [{ label: "AI imported", value: 19, tone: "accent" }],
    categoryBreakdown: [{ label: "Cafe", value: 12, tone: "blue" }],
    sourceBreakdown: [{ label: "TikTok", value: 19, tone: "teal" }],
    lastUpdated: "2026-09-03T00:01:00Z",
  });

  await expect(page.locator(".admin-dashboard-heading .admin-eyebrow")).toHaveText("Operations overview");
  await expect(page.locator(".admin-dashboard-heading h2")).toHaveText("Good morning, Admin");
  await expect(page.locator(".admin-dashboard-heading p")).toHaveText("Monitor vendor quality, content processing, and moderation from one place.");
  await expect(page.locator(".admin-kpi-card")).toHaveCount(5);
  await expect(page.locator(".admin-kpi-card").first()).toContainText("Total vendors");
  await expect(page.locator(".admin-kpi-card").first()).toContainText("123");
  await expect(page.getByRole("heading", { level: 2, name: "Vendor growth" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "AI content pipeline" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Vendor categories" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Source mix" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Recent activity" })).toBeVisible();
  await expect(page.locator(".admin-chart-meta")).toContainText("Last 30 days");
  await expect(page.locator(".admin-last-updated")).toHaveText(/^Updated /);
});

test("vendor growth uses the selected 7, 30, and 90 day report slices", async ({ page }) => {
  const vendorTrend = Array.from({ length: 90 }, (_, index) => ({
    label: `Day ${index + 1}`,
    value: index + 1,
    active: index,
    draft: 0,
  }));
  await openDashboard(page, { ...EMPTY_DASHBOARD, vendorTrend });

  const rangeControl = page.getByRole("group", { name: "Vendor growth range" });
  const axis = page.locator(".admin-chart-axis span");
  await expect(rangeControl.getByRole("button", { name: "30d", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".admin-chart-meta")).toContainText("Last 30 days");
  await expect(axis.first()).toHaveText("Day 61");
  await expect(axis.last()).toHaveText("Day 90");

  await rangeControl.getByRole("button", { name: "7d", exact: true }).click();
  await expect(page.locator(".admin-chart-meta")).toContainText("Last 7 days");
  await expect(axis.first()).toHaveText("Day 84");
  await expect(axis.last()).toHaveText("Day 90");

  await rangeControl.getByRole("button", { name: "90d", exact: true }).click();
  await expect(page.locator(".admin-chart-meta")).toContainText("Last 90 days");
  await expect(axis.first()).toHaveText("Day 1");
  await expect(axis.last()).toHaveText("Day 90");
});

test("legacy stats fill KPI cards and malformed values use shared fallbacks", async ({ page }) => {
  await openDashboard(page, {
    ...EMPTY_DASHBOARD,
    stats: [
      { label: "Legacy total", value: "12", note: "Existing records" },
      { label: "Broken legacy value", value: "not-a-number", note: "Should be safe" },
    ],
  });

  await expect(page.locator(".admin-kpi-card")).toHaveCount(2);
  await expect(page.locator(".admin-kpi-card").nth(0)).toContainText("Legacy total");
  await expect(page.locator(".admin-kpi-card").nth(0)).toContainText("12");
  await expect(page.locator(".admin-kpi-card").nth(1)).toContainText("0");
  await expect(page.locator(".admin-kpi-card").nth(1)).not.toContainText("not-a-number");
});

test("empty modules use shared no-data copy and do not invent a trend point", async ({ page }) => {
  await openDashboard(page, EMPTY_DASHBOARD);

  await expect(page.locator(".admin-chart-empty").filter({ hasText: "No data available for this period." })).toHaveCount(3);
  await expect(page.locator(".admin-chart-empty").filter({ hasText: "Pipeline data is not available yet." })).toBeVisible();
  await expect(page.locator(".admin-empty-state").filter({ hasText: "No immediate issues." })).toBeVisible();
  await expect(page.locator(".admin-empty-state").filter({ hasText: "No recent activity yet." })).toBeVisible();
  await expect(page.locator(".admin-span-8 .admin-line-chart")).toHaveCount(0);
});

test("an existing all-zero trend still renders all three series", async ({ page }) => {
  await openDashboard(page, {
    ...EMPTY_DASHBOARD,
    vendorTrend: [
      { label: "Day 1", value: 0, active: 0, draft: 0 },
      { label: "Day 2", value: 0, active: 0, draft: 0 },
    ],
  });

  await expect(page.locator(".admin-line-chart")).toBeVisible();
  await expect(page.locator(".admin-span-8 .admin-chart-empty").filter({ hasText: "No data available for this period." })).toHaveCount(0);
  await expect(page.locator(".admin-line-chart polyline")).toHaveCount(3);
  await expect(page.locator(".admin-chart-legend")).toContainText("New vendors");
  await expect(page.locator(".admin-chart-legend")).toContainText("Active");
  await expect(page.locator(".admin-chart-legend")).toContainText("Draft");
});

test("activity rows preserve vendor and AI mappings with safe display fallbacks", async ({ page }) => {
  await openDashboard(page, {
    ...EMPTY_DASHBOARD,
    recentVendors: [
      { id: "v-1", name: "Visible vendor", category: "Cafe", location: "Melaka", status: "DRAFT" },
      { id: "v-2", name: "Sparse vendor", status: "" },
      { id: "v-3", name: "Vendor three", category: "Cafe", location: "Melaka", status: "ACTIVE" },
      { id: "v-4", name: "Vendor four", category: "Cafe", location: "Melaka", status: "ACTIVE" },
      { id: "v-5", name: "Should not render", category: "Cafe", location: "Melaka", status: "ACTIVE" },
    ],
    recentProcessing: [
      { id: "ai-1", title: "PRIVATE PROCESSING TITLE", vendor: "Imported vendor", platform: "TikTok", recommendation: "Recommended" },
      { id: "ai-2", vendor: "Imported two", platform: "YouTube", recommendation: "Mixed" },
    ],
  });

  const rows = page.locator(".admin-activity-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText("Vendor");
  await expect(rows.nth(0)).toContainText("Visible vendor");
  await expect(rows.nth(0)).toContainText("Cafe · Melaka");
  await expect(rows.nth(0)).toContainText("DRAFT");
  await expect(rows.nth(1)).toContainText("Uncategorized · Unknown");
  await expect(rows.nth(1)).toContainText("Updated");
  await expect(rows.nth(4)).toContainText("TikTok");
  await expect(rows.nth(4)).toContainText("Imported vendor");
  await expect(rows.nth(4)).toContainText("Recommended");
  await expect(rows.nth(4)).toContainText("AI imported");
  await expect(rows.nth(5)).toContainText("YouTube");
  await expect(rows.nth(5)).toContainText("Imported two");
  await expect(rows.filter({ hasText: "PRIVATE PROCESSING TITLE" })).toHaveCount(0);
  await expect(rows.nth(0)).toHaveAttribute("href", "/admin/vendors2");
  await expect(rows.nth(4)).toHaveAttribute("href", "/admin/ai");
});
