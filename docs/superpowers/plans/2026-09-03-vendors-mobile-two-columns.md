# Vendors Mobile Two Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply approved revision 2: Category/Status and Sort/Export pairs on phones, with desktop unchanged.

**Architecture:** Extend the existing page-local grid to two tracks. Keep search, List/Map and duplicates full width. Reorder only the two existing keyed action elements according to the same media query so keyboard and visual order agree without duplicating live controls; preserve all handlers and filter state.

**Tech Stack:** React useState/useEffect, matchMedia, page-local CSS, existing Playwright network fixture.

## Global Constraints

- 手机布局仅在视口宽度小于 768px 时生效。
- 768px 及以上保持现有工具栏布局与尺寸，不修改桌面基础样式。
- 所有控件外框高度统一为 52px，行间距和两列之间的间距均为 12px，控件文字统一为 14px。
- Category/Status share one row; Sort/Export share the next; duplicates follow on a full row. Search and List/Map each have their own full row.
- 在 320px 手机上仍保留两列，不能让长内容撑宽列或产生页面横向溢出。
- List / Map 在同一外框内各占一半，内部按钮保留至少 44px 的点击高度。
- 桌面保留原有控件排列；手机端的键盘焦点顺序与其视觉排列一致，不能因位置调换而来回跳行。
- No API/data/auth/export-content/header/sidebar/table changes. Preserve unrelated dirty files and the fixed desktop JSON baseline. Keep current fix/user-navigation checkout; no worktree, push or merge.

---

### Task 1: Two-column layout and responsive action order

**Files:**
- Modify: `frontend/src/pages/admin/AdminVendorManagementPage.jsx` (responsive action order only).
- Modify: `frontend/src/pages/admin/vendorMobileFilters.css` (phone-only grid and padding).
- Modify: `frontend/tests/responsive/vendor-mobile-filters.spec.js` (replace single-column expectations, add focus/resize/readability coverage).
- Read-only baseline: `frontend/tests/responsive/vendor-mobile-filters-baseline.json`.

**Interfaces:**
- Consumes existing `controls(page)`, `setup(page, options)`, geometry helpers and GET-only fixture; preserve interception across every `/api/` origin and mutation rejection.
- Produces `isPhoneFilters` view-only boolean and keyed `exportControl`/`duplicatesControl` elements; no new API or business state.

- [x] **Step 1: Confirm baseline and write failing tests before implementation.**

Run the existing focused suite first. Then replace the four phone single-column cases with the following geometry core, retaining font, height, overflow, List/Map and screenshot checks:

```js
const box = Object.fromEntries(await Promise.all(
  ['searchBox', 'view', 'category', 'status', 'sort', 'duplicates', 'exportButton']
    .map(async name => [name, await toolbar[name].boundingBox()])
));
for (const name of ['searchBox', 'view', 'duplicates']) {
  expect(box[name].x).toBeCloseTo(box.searchBox.x, 0);
  expect(box[name].width).toBeCloseTo(box.searchBox.width, 0);
}
for (const [left, right] of [['category', 'status'], ['sort', 'exportButton']]) {
  expect(box[left].y).toBeCloseTo(box[right].y, 0);
  expect(box[left].width).toBeCloseTo(box[right].width, 0);
  expect(box[right].x - box[left].x - box[left].width).toBeCloseTo(12, 0);
  expect(box[left].width * 2 + 12).toBeCloseTo(box.searchBox.width, 0);
}
expect(box.sort.x).toBeCloseTo(box.category.x, 0);
expect(box.exportButton.x).toBeCloseTo(box.status.x, 0);
for (const [previous, next] of [['searchBox', 'view'], ['view', 'category'], ['category', 'sort'], ['sort', 'duplicates']]) {
  expect(box[next].y - box[previous].y - box[previous].height).toBeCloseTo(12, 0);
}
for (const value of Object.values(box)) expect(value.height).toBeCloseTo(52, 0);
```

Update selected-category checks to equal width and same y (not same x) as Status. With no duplicates assert Sort/Export same-row geometry and toolbar ends at that row, without an empty slot. Capture revised phone images at 320 and 390 using `phone-two-column-{width}-after.png`; preserve historical artifacts and the baseline JSON.

Add native Tab tests (no positive tabindex): focus search, then Tab through List, Map, Category, Status, Sort, Export, Duplicates on phone; desktop order must remain Sort, Duplicates, Export. Test desktop→phone→desktop viewport changes with selected filter values retained, native control count unchanged and correct order at each size. Add a 320px pending export test which measures fixed half-width/52px geometry and label text rectangles contained inside the button while waiting and after completion; keep mock GET deferred, then release, no real writes. Label measurements can use a DOM Range around the text/span, normalized to button bounds.

Run `cd frontend && npx playwright test tests/responsive/vendor-mobile-filters.spec.js`. Expected RED from paired y/width and/or phone Tab order against the current single-column production UI; report actual failure before changing production code.

- [x] **Step 2: Implement the minimal view-only change.**

Inside the page add breakpoint state and an effect, using the same exact query as CSS:

```jsx
const [isPhoneFilters, setIsPhoneFilters] = useState(() =>
  typeof window !== 'undefined' && window.matchMedia('(width < 768px)').matches
);
useEffect(() => {
  const media = window.matchMedia('(width < 768px)');
  const update = () => setIsPhoneFilters(media.matches);
  update();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}, []);
```

Move the existing duplicate and export JSX into `duplicatesControl` and `exportControl` constants immediately before `content`, preserving existing props/classes and callbacks. Give roots stable keys `duplicates` and `export`; add classes `vendor-filter-duplicates` and `vendor-filter-export`. Wrap export label in a span to control wrapping, without desktop style changes. Replace the old two action slots with:

```jsx
{isPhoneFilters
  ? [exportControl, duplicatesControl]
  : [duplicatesControl, exportControl]}
```

Keep the duplicate condition (`duplicateGroups.length > 0`) inside `duplicatesControl`. Reuse both elements exactly once, never render hidden duplicates. Keep them in one array sibling slot so React can reconcile stable keys across resizing without remounting the whole toolbar.

Inside the existing phone-only media block change/add:

```css
.vendor-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.vendor-filter-view, .vendor-filter-duplicates { grid-column: 1 / -1; }
.vendor-filter-select select {
  padding-left: 12px;
  padding-right: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vendor-filter-export {
  padding-left: 8px;
  padding-right: 8px;
  gap: 6px;
  line-height: 18px;
}
.vendor-filter-export > span {
  min-width: 0;
  white-space: normal;
}
```

Retain every other mobile dimension and non-phone utility. If measured text does not fit at 320px, adjust only phone padding/wrapping, never the required font size, outer height, or two-column widths.

- [x] **Step 3: Verify behavior and desktop preservation.**

```sh
cd frontend
npx playwright test tests/responsive/vendor-mobile-filters.spec.js
npx playwright test tests/responsive/vendor-mobile-filters.spec.js tests/responsive/vendor-actions-confirmation.spec.js tests/responsive/my-audit-log-filters.spec.js tests/responsive/review-moderation-filters.spec.js tests/responsive/review-moderation-hover.spec.js
npm run test:unit
npm run build
```

Expected: focused and combined browser suites pass, 158 existing unit tests pass, build succeeds (existing chunk warning may remain). Keep Playwright runs serial because port 5174 is exclusive. Parent inspects 320/390 screenshots. No desktop baseline update permitted: unchanged exact geometry and styles must pass at 768/1280/1440. Confirm no real API writes and responsive subscription cleanup.

- [x] **Step 4: Self-review, commit only the three task files, then independent review.**

Run `git diff --check`; inspect exact task diff, ensure all unrelated dirty changes remain untouched. Commit only the three task files with `fix(admin): pair mobile vendor filters`. Write task report with RED/GREEN commands/output, screenshots, changed files, commit and concerns. Controller runs bounded luna_worker review, final verification, and records results without pushing or merging.

## Execution record — 2026-09-03

- Implementation committed as `5cfac4d` (`fix(admin): pair mobile vendor filters`), following plan commit `ed587fe`.
- TDD: original focused suite 8 passed; new paired-layout tests first failed as expected (3 passed / 8 failed); final focused suite 11 passed.
- Measured 320px label fit required phone-only select left padding of 8px instead of the proposed 12px. A regression assertion verifies the default All Categories label fits without changing font size or column width.
- Controller independently reran the combined browser suites: 46 passed; unit suite: 158 passed; production build passed. Existing Vite >500kB chunk warning remains.
- Desktop geometry/style baselines passed at 768, 1280 and 1440px. Baseline JSON SHA256 remains `807c285c1a380ebc5b20aa549c33a74edb65c034cfaec1b54d6680cbf5ce8438`.
- Phone tests cover 320, 390, 430 and 767px, keyboard order, resizing with filter values retained, no-duplicates layout and pending export geometry. Controller visually checked the final 320/390px screenshots.
- Independent luna_worker spec/quality review approved; final whole-feature review approved at `5cfac4d`, no actionable findings. Additional 320px long-selected-category coverage is optional, not an observed defect (long selection is covered at 390px and mobile selects share truncation CSS).
- Preview artifacts: `frontend/responsive-output/vendor-mobile-filters/phone-two-column-320-after.png` and `phone-two-column-390-after.png`.
- Only the three scoped implementation/test files were committed for the feature. Unrelated working-tree changes are preserved. Current `fix/user-navigation` branch retained; no push or merge.
