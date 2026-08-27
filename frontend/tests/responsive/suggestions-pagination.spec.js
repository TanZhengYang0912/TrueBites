import { expect, test } from "@playwright/test";

const BOOKMARK_RESPONSE = JSON.stringify({ bookmarks: [] });
const SUPABASE_AUTH_KEY = "sb-fpmopvxfohiosvjkfqtx-auth-token";

function fakeSession() {
  const farFuture = 4102444800;
  const claims = { sub: "00000000-0000-0000-0000-000000000001", exp: farFuture, role: "authenticated" };
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.signature-not-verified-client-side`,
    refresh_token: "fake-refresh-token",
    token_type: "bearer",
    expires_in: 999999999,
    expires_at: farFuture,
    user: {
      id: claims.sub,
      aud: "authenticated",
      role: "authenticated",
      email: "user@example.com",
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email", id: claims.sub }],
      user_metadata: { first_name: "Test", last_name: "Reviewer" },
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

const records = Array.from({ length: 6 }, (_, index) => ({
  id: `suggestion-${index + 1}`,
  suggestion_type: index === 5 ? "creator" : "vendor",
  vendor_name: `Melaka stall ${index + 1}`,
  creator_name: index === 5 ? "Melaka Food Channel" : null,
  location_text: "Jonker Street, Melaka",
  source_platform: "TikTok",
  source_url: "https://www.tiktok.com/@truebites",
  status: index === 0 ? "submitted" : "under_review",
  created_at: "2026-08-20T00:00:00.000Z",
}));

function response(page, type = "all", status = "all") {
  const pageRecords = type === "creator" ? records.filter((record) => record.suggestion_type === "creator") : records;
  const statusRecords = status === "published" ? pageRecords.filter((record) => record.status === "published") : pageRecords;
  return {
    suggestions: page === 1 ? statusRecords : [],
    pagination: { page, pageSize: 6, total: 12, totalPages: 2 },
    counts: {
      types: { all: 12, vendor: 10, creator: 2 },
      statuses: { all: 12, pending: 8, published: 2, rejected: 2 },
    },
  };
}

test("suggestions list requests pages from the server and resets page after filtering", async ({ page }) => {
  const requests = [];
  await page.route("http://localhost:4000/api/suggestions/mine*", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response(Number(url.searchParams.get("page") || 1), url.searchParams.get("type"), url.searchParams.get("status"))),
    });
  });
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: BOOKMARK_RESPONSE,
  }));

  await page.addInitScript(([key, session]) => window.localStorage.setItem(key, session), [SUPABASE_AUTH_KEY, JSON.stringify(fakeSession())]);
  await page.goto("/suggestions", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Everything 12", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vendors 10", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Influencers / channels 2", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "published 2", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Suggestions pagination" }).getByText("Showing 1–6 of 12")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();
  expect(requests[0].searchParams.toString()).toBe("page=1&pageSize=6&type=all&status=all");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("navigation", { name: "Suggestions pagination" }).getByText("Showing 7–12 of 12")).toBeVisible();
  expect(requests.at(-1).searchParams.get("page")).toBe("2");

  await page.getByRole("button", { name: /^published \d+$/ }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get("status")).toBe("published");
  expect(requests.at(-1).searchParams.get("page")).toBe("1");
});

test("suggestions pagination keeps previous, page, and next controls usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("http://localhost:4000/api/suggestions/mine*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(response(1)),
  }));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: BOOKMARK_RESPONSE,
  }));

  await page.addInitScript(([key, session]) => window.localStorage.setItem(key, session), [SUPABASE_AUTH_KEY, JSON.stringify(fakeSession())]);
  await page.goto("/suggestions", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Previous page" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Suggestions pagination" }).getByText("Page 1 of 2").nth(1)).toBeVisible();
});

test("suggestions uses the same unboxed full-width system as saved places", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("http://localhost:4000/api/suggestions/mine*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(response(1)),
  }));
  await page.route("http://localhost:4000/api/engagement/bookmarks", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: BOOKMARK_RESPONSE,
  }));

  await page.addInitScript(([key, session]) => window.localStorage.setItem(key, session), [SUPABASE_AUTH_KEY, JSON.stringify(fakeSession())]);
  await page.goto("/suggestions", { waitUntil: "networkidle" });

  const rail = page.getByTestId("suggestion-filter-rail");
  const card = page.locator("article").first();
  await expect(rail).toBeVisible();
  await expect(card).toBeVisible();
  expect(await rail.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
  expect(await rail.evaluate((element) => getComputedStyle(element).maxWidth)).toBe("none");
  expect(await card.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).toBe("4px");
  expect(await card.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe("1px");
});
