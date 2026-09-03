# My Audit Log PDF Implementation Plan

> **For agentic workers:** Execute in this session with bounded ownership, test-first implementation and independent final review. Steps use checkbox syntax for tracking.

**Goal:** Export all personal audit-log records through a button below View Site, retaining the page's three columns.

**Architecture:** A small display-only audit row mapper is shared by the screen and PDF. A personal-export coordinator reserves its preview before fetching all pages from `getMyActivity`; the renderer consumes only mapped rows and reuses local fonts. Extract the existing Dashboard preview lifecycle into a shared helper without changing its behavior.

**Tech Stack:** React, existing jsPDF, node:test, Playwright, existing locally licensed fonts, Poppler.

## Global Constraints

- Export all of the signed-in administrator's own records, not the current 25-row page; requests use pageSize 100 and the existing personal endpoint only.
- Only When, Action, Entity are printable; raw metadata and hidden API fields never enter the report.
- A4 landscape, blue/gray admin styling, searchable text, repeated table headings, generated time, count and page numbers; wrap and continue long rows.
- Reserve the preview on click; blocked windows and failures are actionable, failed partial exports are never shown, repeated clicks are disabled, unused blob URLs are reclaimed.
- Keep current branch/workspace for local testing. Do not push, change backend permissions, or change existing list-export behavior.

## Task 1 — shared row model and export pipeline (main agent)

Files: new `frontend/src/lib/auditLogReport.js`, `auditLogPdf.js`, `myAuditLogExport.js`, `pdfPreview.js` and corresponding `.test.mjs`; change only the Dashboard wrapper in `exportPdf.js` to reuse preview cleanup. Forward an optional cancellation signal in `frontend/src/api/admin.js`'s existing `getMyActivity` function.

Interfaces: `formatAuditEntry(entry) -> {id, when, action, entity}`; `renderAuditLogPdf(doc, report) -> doc`; `createAuditLogPdf(report) -> Promise<doc>`; `openMyAuditLogPdf(fetchPage, {signal} = {}) -> Promise<void>`; `openPdfPreview(createDocument, options) -> Promise<void>`. Optional AbortSignal cancels pending exports on route/account changes, without closing delivered reports.

- [x] Write model tests first, including `assert.equal(typeof model.formatAuditEntry, 'function')`, exact capitalized action/date/entity strings, invalid-date fallback and metadata exclusion. Run `node --test src/lib/auditLogReport.test.mjs`; observe missing behavior then implement the whitelist mapper.
- [x] Write real jsPDF tests for headings, multiple pages, last-row preservation, empty rows and oversized content. Run `node --test src/lib/auditLogPdf.test.mjs` red before creating the renderer. Reuse `createPdfText` for measured Unicode runs and `installDashboardFonts` for local font loading; cap row fragments at the remaining page height and repeat all three column headings on continuation pages.
- [x] Test coordinator via browser-boundary substitutes: reserve popup synchronously, fetch pages 1/2/3 at 100, fail page 2 without publishing a blob, retry, block popup before fetch, discard closed preview. Implement coordinator with `fetchAllPages(fetchPage, { pageSize: 100 })`, map each entry before rendering and safely propagate the export error.
- [x] Extract preview lifecycle from the existing Dashboard wrapper after tests cover it; retain Dashboard's synchronous `structuredClone(report)` and lazy PDF import. Run new tests plus `dashboardPdfExport.test.mjs` and full unit suite.

## Task 2 — page integration and browser regression (luna_worker)

Files owned: `frontend/src/pages/admin/AdminMyAuditLogPage.jsx`, audit-specific styles in `frontend/src/global.css`, new `frontend/tests/responsive/my-audit-log-pdf.spec.js` only.

- [x] Add a browser test first that expects `page.getByRole('button', { name: 'Export PDF', exact: true })`; run it against the old page and observe absence. Use synthetic personal-activity fixtures and intercept only root `/api/` requests, never Vite source modules.
- [x] Add an above-table right-aligned toolbar button with `FileDown`, `exporting` state and a synchronous `useRef` guard; call `await openMyAuditLogPdf(getMyActivity)`. On failure show a separate role=alert; use finally to restore the button. Render `formatAuditEntry(entry)` output in the table instead of independent formatting/CSS capitalization.
- [x] Verify more than 100 entries are fetched and exported from any visible page, each request stays on the personal endpoint, no duplicate export occurs during loading, partial failure keeps the table and retry works, blocked popups and empty logs work, and 390px/desktop placement does not overflow. Capture real PDF blobs and screenshots under ignored `frontend/responsive-output/my-audit-log-pdf/`.
- [x] Report exact red/green commands and changed files; main agent reviews and reruns integration. Do not commit independently or run a second browser server concurrently.

## Task 3 — whole-change verification and local handoff

- [x] Ask luna_worker for a bounded independent review of current changes against the approved spec: full pagination, permission/metadata boundary, popup lifecycle, rendering and unchanged other exports.
- [x] Run `npm run test:unit`, `npm run build`, focused audit + Dashboard browser tests and `git diff --check`. Render every page of actual generated normal/empty/long PDFs with Poppler and inspect images; extract searchable text and assert final rows/Unicode survive and private sentinel strings do not appear.
- [x] Fix findings and rerun affected checks; update this checklist and spec status. Commit only source, tests and docs locally. Keep demonstration PDF outside source commit and do not push.

## Progress

- Baseline: commit `cef31bd`; only pre-existing untracked `output/` contains the previous synthetic Dashboard sample.
- Pre-implementation luna_worker API review confirmed actor_id scope, server page-size cap of 100 and raw metadata sensitivity.
- Task 1 red: 6 model/renderer missing-function assertions, 4 coordinator assertions and later abort regression all observed failing before implementation; green: all targeted tests pass.
- Final full unit suite: 152 passed; production build passed with the pre-existing large-main-chunk warning.
- Real PDF QA: 125-record browser export contains all 125 entity IDs across 12 pages; empty and 8-row demo use one page; oversized Unicode fixture uses five pages. All pages rendered and visually inspected; PDF.js extracted Chinese/Latin accents, repeated headers and tail markers, with zero out-of-bounds text or private metadata sentinels.
- Independent review identified missing in-flight network cancellation and a Unicode test-coverage gap. Forwarded AbortSignal through the existing personal API reader; regression observed zero aborted requests before the fix. Added permanent mixed-script pagination coverage with actual local fonts.
- Final combined browser run: 24 passed (9 audit-export scenarios plus 15 existing Dashboard/notification regressions). Independent narrow re-review confirmed both findings resolved and no remaining actionable findings.
