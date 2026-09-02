# Discovery Search and Community CTA Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exchange the discovery search field and Community Discoveries CTA positions and desktop widths while preserving their existing behavior.

**Architecture:** Keep the change inside `Dashboard.jsx`: the CTA becomes the second child of the existing hero grid, and the search label becomes the next full-width row. Add stable test IDs only to the two layout regions so Playwright can measure their relative positions and widths without depending on copy or Tailwind class strings.

**Tech Stack:** React 18, Tailwind CSS, React Router, Playwright, Node test runner, Vite.

## Global Constraints

- Search remains controlled by the existing `search` state and filters vendors immediately.
- The CTA retains the existing authentication guard and `/suggestions/new` destination.
- Desktop CTA width follows the existing 300–420px hero column; the search row fills the content width below.
- Below the existing `lg` breakpoint, order content as hero title, compact CTA, then full-width search without horizontal overflow.
- Preserve the search `aria-label`, CTA button semantics, visible focus treatment, and at least 44px interactive height.
- Do not change APIs, routes, authentication, or vendor-card behavior.

---

### Task 1: Exchange the discovery controls

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx`
- Create: `frontend/tests/responsive/discovery-hero-layout.spec.js`

**Interfaces:**
- Consumes: existing `search`, `setSearch`, `requireAuth`, and `navigate` values inside `Dashboard`.
- Produces: `data-testid="community-discoveries-cta"` and `data-testid="discovery-search"` layout anchors for responsive verification.

- [ ] **Step 1: Write the failing responsive layout test**

```js
import { expect, test } from "@playwright/test";

async function stubVendors(page) {
  await page.route("http://localhost:4000/api/restaurants/nearby?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));
}

test("desktop swaps the community CTA and search widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await stubVendors(page);
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  const hero = page.getByRole("heading", { name: /Hidden gems, authentic flavours/i });
  const cta = page.getByTestId("community-discoveries-cta");
  const search = page.getByTestId("discovery-search");
  const [heroBox, ctaBox, searchBox] = await Promise.all([
    hero.boundingBox(),
    cta.boundingBox(),
    search.boundingBox(),
  ]);

  expect(heroBox).not.toBeNull();
  expect(ctaBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(ctaBox.x).toBeGreaterThan(heroBox.x);
  expect(searchBox.y).toBeGreaterThan(ctaBox.y + ctaBox.height);
  expect(searchBox.width).toBeGreaterThan(ctaBox.width * 2);
});

test("mobile stacks title, community CTA, then search", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await stubVendors(page);
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  const hero = page.getByRole("heading", { name: /Hidden gems, authentic flavours/i });
  const cta = page.getByTestId("community-discoveries-cta");
  const search = page.getByTestId("discovery-search");
  const [heroBox, ctaBox, searchBox] = await Promise.all([
    hero.boundingBox(),
    cta.boundingBox(),
    search.boundingBox(),
  ]);

  expect(heroBox).not.toBeNull();
  expect(ctaBox.y).toBeGreaterThan(heroBox.y + heroBox.height);
  expect(searchBox.y).toBeGreaterThan(ctaBox.y + ctaBox.height);
  expect(ctaBox.width).toBeLessThanOrEqual(375);
  expect(searchBox.width).toBeLessThanOrEqual(375);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd frontend && npx playwright test tests/responsive/discovery-hero-layout.spec.js`

Expected: FAIL because the two `data-testid` elements do not exist and the current search/CTA order is reversed.

- [ ] **Step 3: Move the CTA into the hero grid and the search below it**

In `Dashboard.jsx`, replace the hero grid's search label with the existing CTA button, using compact right-column styling:

```jsx
<button
  type="button"
  data-testid="community-discoveries-cta"
  onClick={requireAuth(() => navigate("/suggestions/new"))}
  className="group flex min-h-16 w-full items-center justify-between gap-3 border border-forest/20 bg-forest px-4 py-3 text-left text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2"
>
  <span className="flex min-w-0 items-center gap-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/12"><Lightbulb size={17} /></span>
    <span className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">Community discoveries</span>
      <span className="mt-0.5 block font-display text-lg leading-tight">Know a hidden gem in Melaka?</span>
    </span>
  </span>
  <span className="shrink-0 text-sm font-bold" aria-hidden="true">→</span>
</button>
```

Immediately after the hero grid, insert the full-width search row and remove the old full-width CTA:

```jsx
<label data-testid="discovery-search" className="relative mb-8 flex w-full items-center">
  <Search size={18} className="absolute left-3.5 text-muted" />
  <input
    value={search}
    onChange={(event) => setSearch(event.target.value)}
    placeholder="Search Nasi Lemak, Jonker, Kopitiam…"
    aria-label="Search places"
    className="min-h-12 w-full rounded border border-sand bg-white pl-11 pr-4 text-ink outline-none placeholder:text-[#8B9197] focus:border-forest focus:shadow-[0_0_0_3px_rgba(64,84,74,0.1)]"
  />
</label>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `cd frontend && npx playwright test tests/responsive/discovery-hero-layout.spec.js`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the layout and test**

```bash
git add frontend/src/components/Dashboard.jsx frontend/tests/responsive/discovery-hero-layout.spec.js
git commit -m "feat: swap discovery search and community CTA"
```

### Task 2: Regression and visual verification

**Files:**
- Verify: `frontend/src/components/Dashboard.jsx`
- Verify: `frontend/tests/responsive/discovery-hero-layout.spec.js`

**Interfaces:**
- Consumes: the layout anchors and responsive behavior from Task 1.
- Produces: verified frontend build and browser layout with no additional source interface.

- [ ] **Step 1: Run the complete frontend unit suite**

Run: `cd frontend && npm run test:unit`

Expected: all unit tests pass.

- [ ] **Step 2: Run the complete responsive suite**

Run: `cd frontend && npm run test:responsive`

Expected: all Playwright tests pass, including the two new discovery hero layout cases.

- [ ] **Step 3: Build the production frontend**

Run: `cd frontend && npm run build`

Expected: Vite exits successfully; bundle-size warnings are non-blocking.

- [ ] **Step 4: Inspect the live desktop and mobile layouts**

Open `http://localhost:5173/map`. At desktop width, confirm the compact CTA occupies the hero's right column and the search spans the row below. At mobile width, confirm the order is title, CTA, search with no horizontal overflow. Click the CTA and type in search to confirm the existing behaviors remain intact.

- [ ] **Step 5: Confirm a clean worktree**

Run: `git status --short --branch && git diff --check`

Expected: the feature commit is present and no generated fixture or test artifact remains.
