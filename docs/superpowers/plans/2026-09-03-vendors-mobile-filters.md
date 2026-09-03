# Vendors Mobile Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Vendors phone toolbar a consistent full-width vertical stack without changing desktop presentation or behavior.

**Architecture:** Keep the existing JSX, utilities, state and handlers. Add narrowly named layout classes and a page-specific CSS import whose declarations all live inside a phone-only media query. Verify actual rendered controls using Playwright and synthetic API responses.

**Tech Stack:** React, existing Tailwind utilities, CSS, Playwright, Vite.

## Global Constraints

- 手机布局仅在视口宽度小于 768px 时生效。
- 768px 及以上保持现有工具栏布局与尺寸，不修改桌面基础样式。
- 每项占满当前内容区宽度，左右边缘一致；外框高度统一为 52px，相邻项垂直间隔 12px，控件文字统一为 14px。
- List / Map 在同一外框内各占一半，内部按钮保留至少 44px 的点击高度。
- Duplicates 不显示时不留下空行。Export PDF 的禁用和 Preparing PDF 状态不改变控件尺寸。
- 商家表格原有的横向滚动行为维持不变。
- Do not modify APIs, authentication, data, exports, header, sidebar, table or other admin pages. Preserve unrelated dirty changes. Work on the existing fix/user-navigation branch; no push, merge or new worktree.

---

### Task 1: Phone-only toolbar alignment with desktop regression coverage

**Files:**
- Modify: `frontend/src/pages/admin/AdminVendorManagementPage.jsx` (import and toolbar class hooks only).
- Create: `frontend/src/pages/admin/vendorMobileFilters.css` (phone layout only).
- Create: `frontend/tests/responsive/vendor-mobile-filters.spec.js` (geometry and functional regression).
- Create: `frontend/tests/responsive/vendor-mobile-filters-baseline.json` (pre-change numeric desktop geometry and computed styles).
- Generated screenshots: `frontend/responsive-output/vendor-mobile-filters/` (ignored, not committed).

**Interfaces:**
- Consumes: Existing `/admin/vendors2`, `getAdminVendors({page,pageSize,status,category,sort,q})`, duplicate groups and existing button handlers.
- Produces: Styling hooks `vendor-filter-toolbar`, `vendor-filter-search`, `vendor-filter-controls`, `vendor-filter-view`, `vendor-filter-select`. No new JavaScript behavior or API.

- [x] **Step 1: Add browser tests and capture the pre-change non-phone baseline.**

Use the existing fixture shape in `vendor-actions-confirmation.spec.js`, with fake vendors (including a duplicate pair), no real image URLs, and path-based interception of every `/api/` request. All writes must be recorded and rejected. Return `{items,pagination:{page,pageSize,total,totalPages}}` for vendor GET, `{groups}` for duplicates, and empty ancillary admin data. Record GET parameters so tests verify the existing handlers still send the chosen search/category/status/sort. Keep API mocking at the network boundary, not the React components.

Locate current controls without relying on the new CSS classes, so tests run against the old UI:

```js
const search = page.getByPlaceholder('Search Vendors, Categories, Dishes…');
const searchBox = search.locator('..');
const list = page.getByRole('button', { name: 'List', exact: true });
const map = page.getByRole('button', { name: 'Map', exact: true });
const view = list.locator('..');
const category = page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'All Categories' }) });
const status = page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'All Statuses' }) });
const sort = page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'Name A–Z' }) });
const duplicates = page.getByRole('button', { name: /possible duplicate/ });
const exportButton = page.getByRole('button', { name: /Export PDF|Preparing PDF/ });
```

For widths 768, 1280 and 1440, record these controls' bounding boxes plus computed font size, radius, padding, colors and shadow before implementation. Commit the numeric baseline as JSON using apply_patch. Retain before screenshots in the ignored output directory. Normal test execution must compare against the fixed baseline, never automatically overwrite it. Wait for data and `document.fonts.ready` before measurement, and neutralize hover/focus for consistent screenshots.

- [x] **Step 2: Run the phone test and confirm the expected red result.**

For each width 320, 390, 430, 767, validate the controls in visual order. Core assertion:

```js
const boxes = await Promise.all(controls.map(control => control.boundingBox()));
for (const [index, box] of boxes.entries()) {
  expect(box.height).toBeCloseTo(52, 0);
  expect(box.x).toBeCloseTo(boxes[0].x, 0);
  expect(box.width).toBeCloseTo(boxes[0].width, 0);
  if (index) expect(box.y - boxes[index - 1].y - boxes[index - 1].height).toBeCloseTo(12, 0);
}
const listBox = await list.boundingBox();
const mapBox = await map.boundingBox();
expect(listBox.width).toBeCloseTo(mapBox.width, 0);
expect(listBox.height).toBeGreaterThanOrEqual(44);
```

Also assert font size 14px on inputs, select and buttons; List / Map fit within the outer container; the toolbar has no horizontal overflow. Run:

```sh
cd frontend
npx playwright test tests/responsive/vendor-mobile-filters.spec.js --grep 'phone'
```

Expected: FAIL on the existing inconsistent control geometry, not a fixture or navigation error. Record the actual failure in the task report before editing production files.

- [x] **Step 3: Apply the minimal phone-only CSS.**

Add `import './vendorMobileFilters.css';` to the Vendors page. Prefix the existing toolbar outer div with `vendor-filter-toolbar`, search wrapper with `vendor-filter-search`, wrapped controls parent with `vendor-filter-controls`, List / Map outer div with `vendor-filter-view`, and each of the three select wrappers with `vendor-filter-select`. Preserve all existing classes, handlers and DOM order.

Create the following CSS (all declarations must stay inside the media query):

```css
/* Keep non-phone layouts on the existing utility styles. */
@media (width < 768px) {
  .vendor-filter-toolbar {
    gap: 12px;
    min-width: 0;
  }

  .vendor-filter-search {
    flex: none;
    height: 52px;
    min-width: 0;
  }

  .vendor-filter-search input {
    min-width: 0;
    font-size: 14px;
  }

  .vendor-filter-search svg,
  .vendor-filter-controls button > svg {
    flex-shrink: 0;
  }

  .vendor-filter-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    width: 100%;
    min-width: 0;
  }

  .vendor-filter-controls > *,
  .vendor-filter-select select {
    width: 100%;
    height: 52px;
    min-width: 0;
  }

  .vendor-filter-controls button,
  .vendor-filter-select select {
    font-size: 14px;
  }

  .vendor-filter-controls > button {
    justify-content: center;
  }

  .vendor-filter-view {
    padding: 3px;
  }

  .vendor-filter-view > button {
    flex: 1 1 0;
    min-width: 0;
    height: 44px;
    justify-content: center;
  }
}
```

- [x] **Step 4: Verify the real page interactions and geometry.**

Run all tests in the new suite. Include the four phone widths, three unchanged baseline widths, absence of duplicates with no empty gap, the longest existing category selected, List / Map state toggling and retained filter parameters, search/category/status/sort requests and page reset. Defer an intercepted export GET to assert Preparing PDF is disabled at the same dimensions, then release it and verify completion. Stub only external map network traffic as needed; do not change production map code. Capture the resulting phone screenshot and inspect it visually.

```sh
cd frontend
npx playwright test tests/responsive/vendor-mobile-filters.spec.js
```

Expected: all passing; desktop numeric baselines unchanged; no backend write sent.

- [x] **Step 5: Run regressions, review and commit this task only.**

```sh
cd frontend
npx playwright test tests/responsive/vendor-mobile-filters.spec.js tests/responsive/vendor-actions-confirmation.spec.js tests/responsive/my-audit-log-filters.spec.js tests/responsive/review-moderation-filters.spec.js tests/responsive/review-moderation-hover.spec.js
npm run test:unit
npm run build
```

Run only one Playwright process at a time because the fixed test port is exclusive. Log any pre-existing build warnings separately. Review `git diff --check` and the exact task diff; stage only the four task files and commit after passing tests. Do not stage existing audit/review/global CSS changes or output files. Report RED/GREEN evidence, commands, screenshots, baseline provenance, changed files, commit and concerns. Controller performs independent spec/quality review and final verification before delivery.

## Execution record — 2026-09-03

- Implemented in `a6d6b16`; test hardening in `1b977d5`. Only the four task files changed; unrelated dirty files preserved.
- TDD RED: four phone-width tests failed on the old 46px search wrapper against the required 52px. GREEN: eight focused tests passed.
- Final controller regression at `1b977d5`: 43 browser tests passed (25.6s). The 158-test unit suite and production build passed; production code was unchanged by the test-only follow-up.
- Exact numeric desktop geometry/styles at 768, 1280 and 1440px match the pre-edit baseline. Phone checks cover 320, 390, 430 and 767px, including full-width controls, typography, long-category selection, duplicate absence and pending-export dimensions.
- Original before PNGs were overwritten by the first test harness version; they are not retained pre-edit evidence. The committed numeric baseline remains genuine and unchanged. Normal runs now write separate after PNGs.
- Visual inspection: phone-390-after.png and desktop-1440-after.png. Local development service on port 5173 serves the new CSS.
- luna_worker preflight, spec/quality review and scoped re-review passed after one test-only fix round; final whole-feature standards/spec review has zero findings.
- Existing tool warnings remain: Vite main chunk exceeds 500kB; Playwright environment has both NO_COLOR and FORCE_COLOR. No new application build failure.
- Kept branch `fix/user-navigation` in place. No push, merge, or real-data mutation.
