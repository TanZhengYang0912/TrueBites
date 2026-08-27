import { expect, test } from "@playwright/test";

test("admin AI profile videos render as full-width horizontal cards", async ({ page }) => {
  await page.route("**/api/admin/ai-records?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } }),
  }));
  await page.route("**/api/ai/scrape-profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ scrape_id: "layout-check" }),
  }));
  await page.route("**/api/ai/scrape-status/layout-check", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "done",
      videos: [
        {
          url: "https://www.tiktok.com/@creator/video/1",
          title: "A long video title that should stay inside the card",
          duration: "0:51",
          view_count: 1200,
        },
        {
          url: "https://www.tiktok.com/@creator/video/2",
          title: "Another video title",
          duration: "0:36",
          view_count: 1000,
        },
      ],
    }),
  }));

  await page.goto("/admin/ai", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Profile Mode/ }).click();
  await page.getByPlaceholder("e.g. https://www.tiktok.com/@username").fill("https://www.tiktok.com/@creator");
  await page.getByRole("button", { name: "Fetch Videos" }).click();

  await expect(page.locator(".video-list-title")).toContainText("2 Videos Found", { timeout: 6_000 });

  const cards = page.locator(".video-card");
  await expect(cards).toHaveCount(2);

  const metrics = await cards.first().evaluate((element) => {
    const card = element.getBoundingClientRect();
    const grid = element.parentElement.getBoundingClientRect();
    const info = element.querySelector(".video-info").getBoundingClientRect();
    return {
      display: getComputedStyle(element).display,
      cardWidth: card.width,
      gridWidth: grid.width,
      infoOffset: info.left - card.left,
    };
  });

  expect(metrics.display).toBe("flex");
  expect(metrics.cardWidth).toBeGreaterThan(metrics.gridWidth - 10);
  expect(metrics.infoOffset).toBeGreaterThan(100);
});

test("admin AI batch progress keeps each job row horizontal", async ({ page }) => {
  await page.route("**/api/admin/ai-records?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } }),
  }));
  await page.route("**/api/ai/scrape-profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ scrape_id: "batch-layout-check" }),
  }));
  await page.route("**/api/ai/scrape-status/batch-layout-check", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "done",
      videos: [
        { url: "https://www.tiktok.com/@creator/video/1", title: "First video" },
        { url: "https://www.tiktok.com/@creator/video/2", title: "Second video" },
      ],
    }),
  }));
  await page.route("**/api/ai/batch-process", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ batch_id: "batch-layout-check", total: 2 }),
  }));
  await page.route("**/api/ai/batch-status/batch-layout-check", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      batch_id: "batch-layout-check",
      profile_url: "https://www.tiktok.com/@creator",
      total: 2,
      completed: 1,
      failed: 0,
      in_progress: 1,
      jobs: [
        { job_id: "job-1", url: "https://www.tiktok.com/@creator/video/1", title: "First video", status: "completed", progress: 100 },
        { job_id: "job-2", url: "https://www.tiktok.com/@creator/video/2", title: "Second video", status: "downloading", progress: 30, step_label: "Downloading" },
      ],
    }),
  }));

  await page.goto("/admin/ai", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Profile Mode/ }).click();
  await page.getByPlaceholder("e.g. https://www.tiktok.com/@username").fill("https://www.tiktok.com/@creator");
  await page.getByRole("button", { name: "Fetch Videos" }).click();
  await expect(page.locator(".video-list-title")).toContainText("2 Videos Found", { timeout: 6_000 });
  await page.getByRole("button", { name: "Process Selected (2)" }).click();

  const rows = page.locator(".batch-job-row");
  await expect(rows).toHaveCount(2, { timeout: 6_000 });

  const metrics = await rows.first().evaluate((element) => {
    const row = element.getBoundingClientRect();
    const info = element.querySelector(".batch-job-info").getBoundingClientRect();
    return { display: getComputedStyle(element).display, infoOffset: info.left - row.left };
  });

  expect(metrics.display).toBe("flex");
  expect(metrics.infoOffset).toBeGreaterThan(70);
});
