# Customer Navigation Dedicated Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Saved, My reviews, and Suggest independent customer routes and remove the engagement page's tab-style navigation.

**Architecture:** React Router owns the active customer section. `/saved` and `/reviews` render the existing engagement experience with an explicit `section` prop, while `/suggestions` remains unchanged. The shared header exposes real links and legacy engagement URLs redirect with `replace`.

**Tech Stack:** React 18, React Router, Playwright, Node test runner, Vite.

## Global Constraints

- Use `/saved`, `/reviews`, and `/suggestions` as the customer-facing destinations.
- Preserve the existing visual design and authentication behavior.
- Redirect `/engagement` to `/saved` and `/engagement?tab=reviews` to `/reviews`.
- Do not use local tab state or a query parameter to choose between Saved and My reviews.
- Follow red-green-refactor and keep unrelated behavior unchanged.

---

### Task 1: Route-owned saved and reviews pages

**Files:**
- Create: `frontend/tests/responsive/customer-navigation.spec.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/EngagementPage.jsx`

**Interfaces:**
- Consumes: existing `EngagementPage` and React Router `Route`, `Navigate`, and `useLocation`.
- Produces: `EngagementPage({ section: "saved" | "reviews" })`, `/saved`, `/reviews`, and query-aware legacy redirects.

- [ ] **Step 1: Write the failing route tests**

Create a Playwright spec that stubs folders, bookmarks, reviews, and suggestions APIs, then asserts the independent headings and legacy redirects:

```js
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
```

- [ ] **Step 2: Run the route tests and verify RED**

Run: `cd frontend && npx playwright test tests/responsive/customer-navigation.spec.js`

Expected: FAIL because `/saved` and `/reviews` are not registered and legacy `/engagement` does not redirect.

- [ ] **Step 3: Add dedicated routes and the legacy redirect**

In `App.jsx`, add a query-aware redirect and route-owned sections:

```jsx
function LegacyEngagementRedirect() {
  const { search } = useLocation();
  const destination = new URLSearchParams(search).get("tab") === "reviews" ? "/reviews" : "/saved";
  return <Navigate to={destination} replace />;
}

<Route path="/saved" element={<EngagementPage section="saved" />} />
<Route path="/reviews" element={<EngagementPage section="reviews" />} />
<Route path="/engagement" element={<LegacyEngagementRedirect />} />
```

In `EngagementPage.jsx`, remove `useSearchParams`, `tab`, and `setTab`. Accept `section`, derive `isReviews`, and use that value for active styling, title, description, and conditional content:

```jsx
export default function EngagementPage({ section }) {
  const isReviews = section === "reviews";
  // existing state and handlers
}
```

Only call `refreshReviews()` when `isReviews`; retain `refreshBookmarks()` for both pages because review-card save controls need bookmark and folder state.

- [ ] **Step 4: Run the route tests and verify GREEN**

Run: `cd frontend && npx playwright test tests/responsive/customer-navigation.spec.js`

Expected: both route tests PASS.

- [ ] **Step 5: Commit the route-owned pages**

```bash
git add frontend/tests/responsive/customer-navigation.spec.js frontend/src/App.jsx frontend/src/pages/EngagementPage.jsx
git commit -m "feat: add dedicated saved and reviews routes"
```

---

### Task 2: Real header links for customer destinations

**Files:**
- Modify: `frontend/tests/responsive/customer-navigation.spec.js`
- Modify: `frontend/src/components/discovery/DiscoveryHeader.jsx`
- Modify: `frontend/src/components/Dashboard.jsx`
- Modify: `frontend/src/components/StaticPageLayout.jsx`
- Modify: `frontend/src/pages/MapPage.jsx`
- Modify: `frontend/src/pages/EngagementPage.jsx`
- Modify: `frontend/src/pages/SuggestionsPage.jsx`
- Modify: `frontend/src/pages/SuggestionFormPage.jsx`

**Interfaces:**
- Consumes: the dedicated routes from Task 1 and React Router `Link`.
- Produces: primary navigation links with `href` values `/saved`, `/reviews`, and `/suggestions` and correct `aria-current` state.

- [ ] **Step 1: Add a failing link-navigation test**

Append to `customer-navigation.spec.js`:

```js
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
```

- [ ] **Step 2: Run the link test and verify RED**

Run: `cd frontend && npx playwright test tests/responsive/customer-navigation.spec.js --grep "primary customer navigation"`

Expected: FAIL because Saved, My reviews, and Suggest are buttons rather than links.

- [ ] **Step 3: Convert the three header controls to links**

In `DiscoveryHeader.jsx`, remove the obsolete callback props and render links:

```jsx
<Link to="/saved" className={activeSection === "saved" ? NAV_ACTIVE : NAV_IDLE} aria-current={activeSection === "saved" ? "page" : undefined}>
  <Bookmark size={14} strokeWidth={1.7} />
  <span>Saved</span>
  {savedCount > 0 && <span className="rounded-full bg-forest px-1.5 text-[10px] font-bold text-white">{savedCount}</span>}
</Link>
<Link to="/reviews" className={activeSection === "reviews" ? NAV_ACTIVE : NAV_IDLE} aria-current={activeSection === "reviews" ? "page" : undefined}>
  My reviews
</Link>
<Link to="/suggestions" className={activeSection === "suggestions" ? NAV_ACTIVE : NAV_IDLE} aria-current={activeSection === "suggestions" ? "page" : undefined}>
  <Lightbulb size={14} strokeWidth={1.8} />
  <span>Suggest</span>
</Link>
```

Remove `onOpenSaved`, `onOpenReviews`, and `onOpenSuggestions` from every `DiscoveryHeader`/`headerProps` call site. Remove `requireSession` from `StaticPageLayout.jsx` because it becomes unused. Keep `requireAuth` in `Dashboard.jsx` for bookmark actions and the Make a suggestion CTA.

- [ ] **Step 4: Run the navigation spec and verify GREEN**

Run: `cd frontend && npx playwright test tests/responsive/customer-navigation.spec.js`

Expected: all three tests PASS.

- [ ] **Step 5: Commit header navigation**

```bash
git add frontend/tests/responsive/customer-navigation.spec.js frontend/src/components/discovery/DiscoveryHeader.jsx frontend/src/components/Dashboard.jsx frontend/src/components/StaticPageLayout.jsx frontend/src/pages/MapPage.jsx frontend/src/pages/EngagementPage.jsx frontend/src/pages/SuggestionsPage.jsx frontend/src/pages/SuggestionFormPage.jsx
git commit -m "refactor: navigate customer header with page links"
```

---

### Task 3: Update route coverage and verify the feature

**Files:**
- Modify: `frontend/tests/responsive/routes.spec.js`
- Modify: `frontend/tests/responsive/control-shapes.spec.js`

**Interfaces:**
- Consumes: `/saved` and `/reviews` from Task 1.
- Produces: responsive coverage that treats Saved and My reviews as distinct pages.

- [ ] **Step 1: Update existing route expectations**

Replace the responsive route matrix entries:

```js
["saved", "/saved"],
["reviews", "/reviews"],
```

Update the saved/review control-shape test to visit `/saved` and `/reviews` directly instead of the legacy engagement URLs.

- [ ] **Step 2: Run focused responsive coverage**

Run:

```bash
cd frontend
npx playwright test tests/responsive/customer-navigation.spec.js tests/responsive/control-shapes.spec.js
```

Expected: all focused tests PASS.

- [ ] **Step 3: Run frontend unit and production-build verification**

Run:

```bash
cd frontend
npm run test:unit
npm run build
```

Expected: all unit tests PASS and Vite exits 0.

- [ ] **Step 4: Run the complete responsive suite**

Run: `cd frontend && npm run test:responsive`

Expected: all responsive tests PASS. If an external image load times out, rerun the exact failed case and report both results rather than hiding the initial failure.

- [ ] **Step 5: Final diff and generated-artifact check**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~2..HEAD
```

Expected: no whitespace errors, no recorder-generated 503 fixtures, and only the planned source/test/docs changes.

- [ ] **Step 6: Commit responsive route coverage**

```bash
git add frontend/tests/responsive/routes.spec.js frontend/tests/responsive/control-shapes.spec.js
git commit -m "test: cover dedicated customer pages"
```
