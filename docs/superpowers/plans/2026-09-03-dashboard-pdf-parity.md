# Dashboard PDF Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the current admin Dashboard snapshot as a readable, searchable A4 landscape PDF with the same content and visual vocabulary.

**Architecture:** A pure shared `buildDashboardReport(data, range)` model feeds both the React dashboard and a dedicated PDF renderer. Export reserves a preview window on the click, snapshots synchronously, loads fonts/PDF dependencies lazily and renders without fetching admin data. Other list exports stay unchanged.

**Tech Stack:** React, existing jsPDF, node:test, Playwright, vendored open-license TrueType fonts, Poppler for PDF verification.

## Global Constraints

- A4 横向、统一边距、清晰可读的字体、浅灰背景、白色圆角卡片、与 Dashboard 一致的主色和状态色。
- 点击 Export PDF 时，固定当前已加载的 Dashboard 数据及当前选择的区间，不额外查询另一批资料。
- PDF 仅含当前 Dashboard 展示字段，不输出访问令牌、内部存储路径、原始 API payload 或未展示的敏感字段。
- 不新增 Detailed report、CSV、定时导出或邮件发送。
- Keep current branch and running workspace for the user's ongoing local testing; do not push or change backend infrastructure.

## Task 1: Shared presentation model and dashboard

**Files:** create `frontend/src/lib/dashboardReport.js` and `dashboardReport.test.mjs`; modify `adminDashboard.js`, `components/admin/AdminCharts.jsx`, `pages/admin/AdminDashboardPage.jsx`.

**Interface:** `buildDashboardReport(payload, range=30)` returns fresh display-only objects: `heading {eyebrow,title,subtitle,updated}`, `range`, `rangeLabel`, `kpis`, `trend`, `attentionItems`, `aiPipeline`, `categoryBreakdown`, `sourceBreakdown`, `activityRows`. Export constants `DASHBOARD_COPY`, `DASHBOARD_COLORS`, `TREND_SERIES`; shared chart math can be exported from this module. Heading updated is already formatted. Activity rows have `id,type,title,meta,status,href`; the renderer prints only type/title/meta/status.

- [x] Add regression tests before implementation; first assert `typeof report.buildDashboardReport === 'function'`, then verify 7/30/90 slices, legacy KPIs, missing arrays, copied rows, and ignored private fields. Run `node --test src/lib/dashboardReport.test.mjs` and observe the missing-function assertion fail.
- [x] Implement a whitelist mapping (never spread API rows), finite numeric values, shared empty copy, safe date formatting and unchanged activity 4+4 then 6 selection. Use `payload.vendorTrend.slice(-range)` only for growth; never filter KPIs.
- [x] Replace page-local KPI fallback, activity mapping and hardcoded module headings with the shared model. Use `useMemo(() => data ? buildDashboardReport(data, range) : null, [data, range])`; display and export that model. Empty trend renders the shared No data message rather than invented zero points.
- [x] Run model/unit suite and production build. Review diff against spec before renderer integration.

## Task 2: Searchable, paginated PDF renderer

**Files:** create `frontend/src/lib/dashboardPdf.js`, `dashboardPdf.test.mjs`, `dashboardPdfFonts.js`; add licensed font assets under `frontend/public/fonts/`; replace only the overview-specific block in `exportPdf.js`.

**Interface:** `createDashboardPdf(report)` returns a jsPDF document asynchronously; `renderDashboardPdf(doc, report)` draws the supplied document after fonts are installed. `openOverviewPdf(report)` retains the existing entrypoint. Font helper installs vendored fonts locally, with readable error messages on fetch/glyph failure.

- [x] Write real jsPDF-output tests for two landscape pages, module labels/order, values, no status pie, and long-content continuation before implementation. Stub only the browser window/fetch boundaries when needed; inspect real PDF content/geometry.
- [x] Add drawing primitives for panel/header/body/footer and wrapped searchable text; map colors from the shared model. Draw KPI icons as vector geometry, then labels, values, notes without sparklines.
- [x] Draw page 1: header, KPI row, growth (three vector polylines with shared scale), attention. Draw page 2: 5:4:3 horizontal chart panels then activity. Paginate wrapped rows into continued panels, repeat headers, number all pages after rendering; preserve text instead of truncating or rasterizing it.
- [x] Ensure TrueType font coverage for supported actual names; lazy-load local font files, retain license and provenance. No remote font request containing user data.
- [x] Reserve a popup synchronously, clone the report before awaiting dependencies, show preparing state; install the PDF blob URL on success. On error close the reserved popup and throw a safe user-visible message; reclaim blob URLs after their viewer closes. Handle blocked popup explicitly.
- [x] Keep all other PDF exports byte-for-byte unchanged outside the overview-specific helpers. Run unit tests/build and review implementation.

## Task 3: Browser integration and independent verification

**Files:** create `frontend/tests/responsive/dashboard-pdf.spec.js` using synthetic admin API fixtures and the existing auth-disabled test server; samples/captures stay under ignored `frontend/responsive-output/`.

- [x] Before integration, test the Export PDF click with stubbed API data. Capture the actual blob from the reserved popup; assert non-empty PDF, selected range, displayed numbers and unchanged snapshot when changing range during font loading. Add failure/blocked-popup retry and empty dashboard cases.
- [x] Generate an actual sample with synthetic 607/49%/297/605/28 KPIs and Chinese/long names. Extract its text with `pdftotext`, render every page with `pdftoppm -png`, inspect visual layout and text bounding boxes, fix any clipping/overlap.
- [x] Ask luna_worker to independently review spec consistency, privacy, cleanup and pagination while running `npm run test:unit`, `npm run build`, focused Playwright tests and `git diff --check`.
- [x] Fix material findings and rerun affected checks; update this checklist. Commit only implementation/docs/tests/font assets after passing verification, do not push.

## Progress

- Baseline: 125 unit tests pass on `d4e9b46`; no pre-existing worktree changes.
- Used luna_worker for font compatibility, the bounded dashboard UI integration, and the final independent spec/privacy/pagination review.
- Final independent review: pass, no actionable Critical/Important/Minor findings.
- Final verification: 139 unit tests, 15 focused browser tests, production build, and `git diff --check` pass. Build retains the existing large-main-chunk warning.
- Real browser exports: normal sample 2 A4 landscape pages, empty sample 2 pages, long sample 4 pages. Poppler renders visually inspected; text extraction retains Chinese/Latin accents and end-of-content markers. PDF.js found zero out-of-page text items in all three samples.
- Corrected two rendering issues found by verification: regular six-row activity initially spilled onto page 3, and oversized KPI notes needed continuation. Both have regression tests.
- Generated QA PDFs/screenshots are not source assets. The user-facing PDF uses synthetic demonstration data and is kept locally under `output/pdf/`.
