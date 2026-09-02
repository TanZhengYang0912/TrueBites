import { expect, test } from "@playwright/test";

async function stubCustomerApis(page) {
  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  const reviewRequests = [];
  await page.route("http://localhost:4000/api/engagement/folders", (route) => route.fulfill(json({ folders: [] })));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill(json({ bookmarks: [] })));
  await page.route("http://localhost:4000/api/engagement/reviews/mine", (route) => {
    reviewRequests.push(route.request().url());
    return route.fulfill(json({ reviews: [] }));
  });
  await page.route("http://localhost:4000/api/suggestions/mine*", (route) => route.fulfill(json({
    suggestions: [],
    counts: { types: { all: 0, vendor: 0, creator: 0 }, statuses: { all: 0, pending: 0, published: 0, rejected: 0 } },
    pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1 },
  })));
  return { reviewRequests };
}

test("saved and reviews are independent reloadable pages", async ({ page }) => {
  const { reviewRequests } = await stubCustomerApis(page);
  await page.goto("/saved", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole("heading", { name: "Saved places" })).toBeVisible();
  expect(reviewRequests).toHaveLength(0);

  await page.goto("/reviews", { waitUntil: "networkidle" });
  expect(reviewRequests).toHaveLength(1);
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
  const savedLink = primary.getByRole("link", { name: /Saved/ });
  const reviewsLink = primary.getByRole("link", { name: "My reviews" });
  const suggestionsLink = primary.getByRole("link", { name: /Suggest/ });
  await expect(primary).not.toHaveAttribute("role", "tablist");
  await expect(savedLink).not.toHaveAttribute("role", "tab");
  await expect(reviewsLink).not.toHaveAttribute("role", "tab");
  await expect(suggestionsLink).not.toHaveAttribute("role", "tab");
  await expect(savedLink).toHaveAttribute("href", "/saved");
  await expect(reviewsLink).toHaveAttribute("href", "/reviews");
  await expect(suggestionsLink).toHaveAttribute("href", "/suggestions");
  await expect(savedLink).toHaveAttribute("aria-current", "page");
  await expect(reviewsLink).not.toHaveAttribute("aria-current", "page");

  await page.evaluate(() => {
    window.__trueBitesDocumentMarker = "saved-document";
  });
  await reviewsLink.click();
  await expect(page).toHaveURL(/\/reviews$/);
  await expect.poll(() => page.evaluate(() => window.__trueBitesDocumentMarker)).toBeUndefined();
  await expect(page.getByRole("heading", { name: "My reviews" })).toBeVisible();
  await expect(savedLink).not.toHaveAttribute("aria-current", "page");
  await expect(reviewsLink).toHaveAttribute("aria-current", "page");

  await page.evaluate(() => {
    window.__trueBitesDocumentMarker = "reviews-document";
  });
  await suggestionsLink.click();
  await expect(page).toHaveURL(/\/suggestions$/);
  await expect.poll(() => page.evaluate(() => window.__trueBitesDocumentMarker)).toBeUndefined();
  await expect(page.getByRole("heading", { name: "My suggestions" })).toBeVisible();
});
