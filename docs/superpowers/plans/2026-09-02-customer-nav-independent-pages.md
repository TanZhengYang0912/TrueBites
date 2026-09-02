# Customer Navigation Independent Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Saved, My reviews, and Suggest ordinary page-navigation links, with Saved and Reviews rendered by separate top-level page components and no tab-like active treatment.

**Architecture:** Replace the mode-driven `EngagementPage` with `SavedPage` and `ReviewsPage`. Move only genuinely shared small UI controls into a focused engagement component module; each page owns its own state, data fetching, filters, and mutations. Keep React Router links and browser history, while changing the active navigation treatment from a filled rounded block to a restrained underline/text indicator.

**Tech Stack:** React 18, React Router DOM, Vite, Tailwind utility classes, Node test runner, Playwright.

## Global Constraints

- `/saved`, `/reviews`, and `/suggestions` must render independent page components.
- No shared top-level page may select Saved versus Reviews through `section`, `tab`, or an equivalent mode prop.
- Navigation stays in the current browser tab and preserves direct URLs, reload, Back, and Forward.
- Saved/My reviews/Suggest remain semantic links with `aria-current="page"` on the current destination.
- The filled rounded active-navigation block must be removed; use a restrained text-colour/underline indicator.
- Existing page content, filters, pagination, cards, modals, folder behavior, review behavior, authentication gates, and legacy redirects must remain functional.

---

## File Structure

- Create `frontend/src/pages/SavedPage.jsx`: saved-place page state, folder/bookmark operations, saved cards, and saved-specific modals.
- Create `frontend/src/pages/ReviewsPage.jsx`: review loading/filtering/pagination, bookmark controls used from reviews, and review-specific modals.
- Create `frontend/src/components/engagement/EngagementPageControls.jsx`: presentational `Empty`, `FolderPill`, `FolderMoveSelect`, and `Pagination` controls currently embedded in `EngagementPage`.
- Delete `frontend/src/pages/EngagementPage.jsx`: remove the mode-driven top-level page after both routes are migrated.
- Modify `frontend/src/App.jsx`: import and route the two independent pages.
- Modify `frontend/src/components/discovery/DiscoveryHeader.jsx`: render ordinary link styling with a restrained active indicator.
- Create `frontend/src/lib/customerNavigation.test.mjs`: fast architectural regression tests for route ownership and nav styling.
- Modify `frontend/src/lib/discoveryLayout.test.mjs`: cover both new page files instead of the removed mode-driven page.
- Modify `frontend/tests/responsive/customer-navigation.spec.js`: preserve behavioral route tests and assert the navigation is not presented as tabs.

---

### Task 1: Lock the independent-page architecture with a failing test

**Files:**
- Create: `frontend/src/lib/customerNavigation.test.mjs`
- Test: `frontend/src/lib/customerNavigation.test.mjs`

**Interfaces:**
- Consumes: source files relative to `frontend/src`.
- Produces: regression requirements for `SavedPage`, `ReviewsPage`, route wiring, removal of mode-driven `EngagementPage`, and non-tab header styling.

- [ ] **Step 1: Write the failing source-architecture tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (relativePath) => fs.readFileSync(path.join(here, "..", relativePath), "utf8");

test("saved and reviews are owned by separate page components", () => {
  const app = src("App.jsx");
  assert.match(app, /import SavedPage from "\.\/pages\/SavedPage"/);
  assert.match(app, /import ReviewsPage from "\.\/pages\/ReviewsPage"/);
  assert.match(app, /path="\/saved" element={<SavedPage \/>}/);
  assert.match(app, /path="\/reviews" element={<ReviewsPage \/>}/);
  assert.doesNotMatch(app, /EngagementPage|section="(?:saved|reviews)"/);
  assert.equal(fs.existsSync(path.join(here, "..", "pages", "EngagementPage.jsx")), false);
});

test("customer page navigation is link-based without a filled active tab", () => {
  const header = src("components/discovery/DiscoveryHeader.jsx");
  assert.match(header, /to="\/saved"/);
  assert.match(header, /to="\/reviews"/);
  assert.match(header, /to="\/suggestions"/);
  assert.match(header, /aria-current=.*"page"/s);
  assert.doesNotMatch(header, /const NAV_ACTIVE = `\$\{NAV_LINK\} bg-/);
  assert.match(header, /after:.*bg-terracotta|border-b-2.*terracotta/);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `cd frontend && node --test src/lib/customerNavigation.test.mjs`

Expected: FAIL because `SavedPage.jsx` and `ReviewsPage.jsx` are not imported/routed, `EngagementPage.jsx` still exists, and `NAV_ACTIVE` still contains `bg-forest/8`.

- [ ] **Step 3: Commit the failing test**

```bash
git add -f frontend/src/lib/customerNavigation.test.mjs
git commit -m "test: require independent customer pages"
```

---

### Task 2: Split Saved and Reviews into independent pages

**Files:**
- Create: `frontend/src/pages/SavedPage.jsx`
- Create: `frontend/src/pages/ReviewsPage.jsx`
- Create: `frontend/src/components/engagement/EngagementPageControls.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/lib/discoveryLayout.test.mjs`
- Delete: `frontend/src/pages/EngagementPage.jsx`
- Test: `frontend/src/lib/customerNavigation.test.mjs`
- Test: `frontend/src/lib/discoveryLayout.test.mjs`

**Interfaces:**
- Consumes: `getBookmarks`, `getFolders`, `getMyReviews`, bookmark/folder mutations, `DiscoveryPageShell`, `DiscoveryPageIntro`, `VendorCard`, `VendorDetailModal`, `FolderPickerModal`, `Toast`, `useToast`, and session helpers.
- Produces: default exports `SavedPage()` and `ReviewsPage()`; named exports `Empty`, `FolderPill`, `FolderMoveSelect`, and `Pagination` from `EngagementPageControls.jsx`.

- [ ] **Step 1: Extract the shared presentational controls without behavior changes**

Move the existing `Empty`, `FolderPill`, `FolderMoveSelect`, `Pagination`, and their pagination helper from `EngagementPage.jsx` into `EngagementPageControls.jsx`. Keep their existing function bodies byte-for-byte and add named exports with these exact imports and signatures:

```jsx
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FolderInput, Trash2 } from "lucide-react";

export function Empty({ icon, text })
export function FolderPill({ label, count, active, onClick, onDelete })
export function FolderMoveSelect({ row, folders, onMove })
export function Pagination({ page, totalPages, onChange })
```

The module imports its own `useEffect`, `useRef`, `useState`, and Lucide icons. It must not accept a page mode or decide which page content renders.

- [ ] **Step 2: Create `SavedPage` from the saved-only branch**

Create a default `SavedPage()` component. Its page-owned state must be exactly the saved-page subset below before the existing saved handlers and JSX are moved into it:

```jsx
export default function SavedPage() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);
  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [bookmarkPage, setBookmarkPage] = useState(1);
  const [detailVendor, setDetailVendor] = useState(null);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState(null);
  const [pendingUnbookmarkVendor, setPendingUnbookmarkVendor] = useState(null);
  const [toast, notify] = useToast();
}
```

Move the current saved-only derived values, handlers, `DiscoveryPageShell`, `DiscoveryPageIntro`, folder rail, saved-card grid, detail modal, folder picker, delete confirmation, unbookmark confirmation, and toast into this component. Use `activeSection: "saved"` in the shell header props. Do not import `getMyReviews`; do not declare review search/rating/sort/page state; do not contain `isReviews`, `section`, or conditional rendering for the reviews page.

- [ ] **Step 3: Create `ReviewsPage` from the reviews-only branch**

Create a default `ReviewsPage()` component. Its page-owned state must be exactly the review-page subset below before the existing review handlers and JSX are moved into it:

```jsx
export default function ReviewsPage() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);
  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewRating, setReviewRating] = useState("all");
  const [reviewSort, setReviewSort] = useState("newest");
  const [reviewPage, setReviewPage] = useState(1);
  const [detailVendor, setDetailVendor] = useState(null);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null);
  const [pendingUnbookmarkVendor, setPendingUnbookmarkVendor] = useState(null);
  const [toast, notify] = useToast();
}
```

Move the current review-only derived values, handlers, `DiscoveryPageShell`, `DiscoveryPageIntro`, filters, review-card grid, detail modal, folder picker, unbookmark confirmation, and toast into this component. Use `activeSection: "reviews"` in the shell header props. Do not contain folder-rail UI, folder deletion, `activeFolder`, `bookmarkPage`, `isReviews`, `section`, or conditional rendering for the saved page.

- [ ] **Step 4: Route the independent pages and remove the old mode-driven page**

Replace the imports and routes in `App.jsx` with:

```jsx
import SavedPage from "./pages/SavedPage";
import ReviewsPage from "./pages/ReviewsPage";

<Route path="/saved" element={<SavedPage />} />
<Route path="/reviews" element={<ReviewsPage />} />
```

Keep `LegacyEngagementRedirect` unchanged. Delete `EngagementPage.jsx` only after both new pages compile.

- [ ] **Step 5: Update shared-layout coverage**

In `discoveryLayout.test.mjs`, replace the single `"pages/EngagementPage.jsx"` fixture with both:

```js
"pages/SavedPage.jsx",
"pages/ReviewsPage.jsx",
```

- [ ] **Step 6: Run focused tests and verify GREEN for architecture**

Run: `cd frontend && node --test src/lib/customerNavigation.test.mjs src/lib/discoveryLayout.test.mjs`

Expected: the independent-page test may still fail only on the active navigation styling assertion; all separate-component, route, deletion, and shared-layout assertions pass.

- [ ] **Step 7: Build to catch JSX/import errors**

Run: `cd frontend && npm run build`

Expected: PASS with a Vite production bundle and no unresolved imports.

- [ ] **Step 8: Commit the page split**

```bash
git add frontend/src/App.jsx frontend/src/pages/SavedPage.jsx frontend/src/pages/ReviewsPage.jsx frontend/src/components/engagement/EngagementPageControls.jsx frontend/src/lib/discoveryLayout.test.mjs
git add -u frontend/src/pages/EngagementPage.jsx
git commit -m "refactor: split saved and reviews into pages"
```

---

### Task 3: Make the header look like page navigation, not tabs

**Files:**
- Modify: `frontend/src/components/discovery/DiscoveryHeader.jsx`
- Modify: `frontend/tests/responsive/customer-navigation.spec.js`
- Test: `frontend/src/lib/customerNavigation.test.mjs`
- Test: `frontend/tests/responsive/customer-navigation.spec.js`

**Interfaces:**
- Consumes: existing `activeSection` values from each page and existing React Router `Link` destinations.
- Produces: ordinary link styling, restrained current-page indicator, and unchanged `aria-current="page"` semantics.

- [ ] **Step 1: Extend the browser test to reject tab semantics**

Add these assertions after locating the primary navigation links:

```js
await expect(primary).not.toHaveAttribute("role", "tablist");
await expect(savedLink).not.toHaveAttribute("role", "tab");
await expect(reviewsLink).not.toHaveAttribute("role", "tab");
await expect(suggestionsLink).not.toHaveAttribute("role", "tab");
```

Keep the existing URL, heading, href, and `aria-current` assertions.

- [ ] **Step 2: Run the focused source test and verify the remaining RED failure**

Run: `cd frontend && node --test src/lib/customerNavigation.test.mjs`

Expected: FAIL only because `NAV_ACTIVE` still contains a filled `bg-forest/8` active style and lacks the restrained indicator.

- [ ] **Step 3: Replace the filled active block with a restrained page indicator**

Change only the navigation constants:

```jsx
const NAV_LINK = "relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-semibold transition-colors motion-reduce:transition-none";
const NAV_IDLE = `${NAV_LINK} text-muted hover:text-forest`;
const NAV_ACTIVE = `${NAV_LINK} text-forest after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-terracotta`;
```

Do not add tab roles or click-state variables. Preserve the three `Link` elements and their `aria-current` attributes.

- [ ] **Step 4: Run focused source and browser tests and verify GREEN**

Run: `cd frontend && node --test src/lib/customerNavigation.test.mjs`

Expected: PASS.

Run: `cd frontend && npx playwright test tests/responsive/customer-navigation.spec.js`

Expected: all customer-navigation scenarios PASS, including URL changes, headings, reloads, redirects, and link semantics.

- [ ] **Step 5: Commit the navigation presentation change**

```bash
git add frontend/src/components/discovery/DiscoveryHeader.jsx frontend/tests/responsive/customer-navigation.spec.js
git commit -m "fix: present customer links as page navigation"
```

---

### Task 4: Regression and visual verification

**Files:**
- Verify only; modify production files only if a failing test identifies a regression in the approved scope.

**Interfaces:**
- Consumes: completed independent pages and header navigation.
- Produces: evidence that unit tests, responsive tests, build, runtime routes, and privacy-sensitive browser output are clean.

- [ ] **Step 1: Run all frontend unit tests**

Run: `cd frontend && npm run test:unit`

Expected: PASS with no failures.

- [ ] **Step 2: Run the complete responsive suite**

Run: `cd frontend && npm run test:responsive`

Expected: PASS. If an unrelated environment-only failure occurs, record the exact failing test and confirm the focused customer-navigation suite still passes.

- [ ] **Step 3: Run the production build**

Run: `cd frontend && npm run build`

Expected: PASS with no unresolved imports or JSX errors.

- [ ] **Step 4: Verify the live routes in the browser**

With the existing Vite server, visit `/saved`, click My reviews, then click Suggest. Confirm the current browser tab changes to `/reviews` and `/suggestions`, each page shows its own heading, Back returns through the routes, and the active destination uses the underline indicator rather than a filled rounded block.

- [ ] **Step 5: Perform an independent bounded review**

Ask a `luna_worker` to review the final diff and running pages for route separation, permission/auth regressions, sensitive-data exposure, internal file-system paths, service keys, tokens, and signed storage URLs. The worker must not edit files.

- [ ] **Step 6: Review git status and final diff**

Run: `git status --short && git diff --check && git log --oneline -5`

Expected: no unstaged implementation changes, no whitespace errors, and the planned commits are present.
