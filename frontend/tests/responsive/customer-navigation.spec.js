import { expect, test } from "@playwright/test";

async function stubCustomerApis(page) {
  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("http://localhost:4000/api/engagement/folders", (route) => route.fulfill(json({ folders: [] })));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill(json({ bookmarks: [] })));
  await page.route("http://localhost:4000/api/engagement/reviews/mine", (route) => route.fulfill(json({ reviews: [] })));
  await page.route("http://localhost:4000/api/suggestions/mine*", (route) => route.fulfill(json({
    suggestions: [],
    counts: { types: { all: 0, vendor: 0, creator: 0 }, statuses: { all: 0, pending: 0, published: 0, rejected: 0 } },
    pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1 },
  })));
}

test("saved and reviews are independent reloadable pages", async ({ page }) => {
  await stubCustomerApis(page);
  await page.goto("/saved", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole("heading", { name: "Saved places" })).toBeVisible();

  await page.goto("/reviews", { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/reviews$/);
  await expect(page.getByRole("heading", { name: "My reviews" })).toBeVisible();
});

test("legacy engagement URLs redirect to their dedicated pages", async ({ page }) => {
  await stubCustomerApis(page);
  await page.goto("/engagement", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/saved$/);
  await page.goto("/engagement?tab=reviews", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/reviews$/);
});

test("primary customer navigation uses dedicated page links", async ({ page }) => {
  await stubCustomerApis(page);
  await page.goto("/saved", { waitUntil: "networkidle" });

  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primary.getByRole("link", { name: /Saved/ })).toHaveAttribute("href", "/saved");
  await expect(primary.getByRole("link", { name: "My reviews" })).toHaveAttribute("href", "/reviews");
  await expect(primary.getByRole("link", { name: /Suggest/ })).toHaveAttribute("href", "/suggestions");

  await primary.getByRole("link", { name: "My reviews" }).click();
  await expect(page).toHaveURL(/\/reviews$/);
  await expect(page.getByRole("heading", { name: "My reviews" })).toBeVisible();

  await primary.getByRole("link", { name: /Suggest/ }).click();
  await expect(page).toHaveURL(/\/suggestions$/);
  await expect(page.getByRole("heading", { name: "My suggestions" })).toBeVisible();
});
