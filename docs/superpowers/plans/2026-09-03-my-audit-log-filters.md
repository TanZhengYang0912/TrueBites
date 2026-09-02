# My Audit Log Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give My Audit Log Vendors-style controls and export all matching personal records in the selected order.

**Architecture:** The personal activity endpoint applies a validated filter object before counting and pagination. Frontend query helpers resolve Malaysian calendar-day presets once; the list and PDF consume the same immutable applied query. Existing report projection, local PDF fonts and preview cancellation remain in use.

**Tech Stack:** Express, Supabase/PostgREST, React, jsPDF, Node test runner, Playwright.

## Global Constraints

- Only My Audit Log changes; Vendors, Dashboard and other pages retain existing behavior.
- Keep current `fix/user-navigation` checkout for live testing. Do not push or switch branches; preserve untracked `output/`.
- My Audit Log remains scoped to the verified current administrator; never accept another actor ID.
- Do not search, select or export metadata or private hidden fields.
- Page size 25 for the UI, capped at 100 for export. Export all matching pages, not the current UI page.
- Query wire fields: `q`, `entity`, `from`, `to`, `sort`, in addition to `page` and `pageSize`.
- Defaults: q empty, entity `all`, from/to empty, sort `newest`. Sort values only `newest` and `oldest`, ordered by created_at then id ascending as tie-break.
- Entity choices: all, account, profile, suspension_appeal, user, vendor, review, bookmark_folder, vendor_suggestion, ai_job. Unknown historical entities remain visible under all and searchable.
- Search max 100 characters; literal case-insensitive action/entity-type substring search. Full UUID q additionally matches entity_id exactly. Escape wildcard and PostgREST grammar; do not interpolate raw search into filters.
- Date bounds are canonical ISO UTC strings, paired, valid and from < to; use inclusive from and exclusive to. Frontend presets use Asia/Kuala_Lumpur calendar days including today.
- Continue without intermediate approval questions. TDD first, bounded independent review at task gates, then final checks.

---

### Task 1: Server-side personal audit query

**Files:**
- Create `backend/lib/myAuditLogQuery.js`
- Create `backend/lib/myAuditLogQuery.test.mjs`
- Modify only the personal `/me/activity` route and imports in `backend/routes/admin.js`

**Interfaces:**
- Produce `parseMyAuditLogQuery(raw)` returning `{page,pageSize,q,entity,from,to,sort}`; invalid filters throw an error with status 400.
- Produce `queryMyAuditLog(supabase, actorId, parsed)` returning the existing `{items,pagination}` response; only display fields are projected.
- Route validates even in dev bypass, then returns empty for synthetic actor `dev` or queries real caller. Safe 400/500 errors contain no backend details.

- [ ] Write failing node tests importing the module optionally so missing exports fail assertions. Cover defaults, cap, filter validation, query sequence/projection, punctuation injection, UUID q, date bounds and actor isolation. Use real Supabase client with a captured fetch URL (no network) to inspect generated PostgREST parameters.

```js
assert.equal(typeof query.parseMyAuditLogQuery, 'function');
assert.deepEqual(query.parseMyAuditLogQuery({}).sort, 'newest');
assert.throws(() => query.parseMyAuditLogQuery({sort:'random'}), /sort/i);
assert.throws(() => query.parseMyAuditLogQuery({q:'x'.repeat(101)}), /search/i);
// Captured URL must include actor_id=eq.current-admin, order=created_at.asc,id.asc,
// entity_type=eq.vendor, created_at=gte.from AND lt.to, and exclude metadata.
```

- [ ] Run `cd backend && node --test lib/myAuditLogQuery.test.mjs`, confirm missing functionality failures.
- [ ] Implement validation and query, with the key query order:

```js
let request = supabase.from('audit_log')
  .select('id, action, entity_type, entity_id, created_at', {count:'exact'})
  .eq('actor_id', actorId);
if (entity !== 'all') request = request.eq('entity_type', entity);
if (from) request = request.gte('created_at', from).lt('created_at', to);
// Add safely quoted literal substring OR for action/entity_type; validated UUID
// additionally gets entity_id.eq. Escape backslash, quote, %, _, and *.
request = request.order('created_at', {ascending: sort === 'oldest'})
  .order('id', {ascending:true})
  .range((page - 1) * pageSize, page * pageSize - 1);
```

Map only `{id,action,entityType,entityId,createdAt}` from the response, with pagination based on filtered exact count. Route uses parsed values and verified caller, never a query actor.
- [ ] Run focused tests, `npm test`, `node --check routes/admin.js`, `git diff --check`; report pre-existing failures separately, never hide them.
- [ ] Commit only Task 1 files. Report RED/GREEN commands and results, review permissions and SQL filter safety. Independent reviewer checks spec + quality before proceeding.

### Task 2: Applied filter UI and matching PDF

**Files:**
- Create `frontend/src/lib/myAuditLogFilters.js` and `myAuditLogFilters.test.mjs`
- Modify `frontend/src/api/admin.js` getMyActivity only
- Modify `frontend/src/pages/admin/AdminMyAuditLogPage.jsx` and audit-only CSS in `frontend/src/global.css`
- Modify `frontend/src/lib/myAuditLogExport.js`, `auditLogReport.js`, `auditLogPdf.js` and their tests
- Create `frontend/tests/responsive/my-audit-log-filters.spec.js`; adjust existing audit PDF tests only where new controls affect selectors

**Interfaces:**
- `createAuditLogQuery({q='',entity='all',period='all',sort='newest'}={}, now=new Date())` returns only `{q,entity,from,to,sort}`.
- `describeAuditLogQuery(query)` returns a human-readable string with search, entity, absolute Malaysian dates (when filtered), and sort. Defaults also state All entities, Any time and Newest first.
- Export `AUDIT_ENTITY_OPTIONS`, `AUDIT_PERIOD_OPTIONS`, `AUDIT_SORT_OPTIONS` for the UI and labels.
- `getMyActivity({page=1,pageSize=25,q='',entity='all',from='',to='',sort='newest',signal}={})` sends only those query fields plus pagination.
- `openMyAuditLogPdf(fetchPage,{signal,query}={})` snapshots query on entry and passes it to every fetched page and report builder.
- `buildAuditLogReport(entries,now=new Date(),query)` keeps prior call compatibility, adds the described `filters` string. Renderer wraps filters below generated/count, computes table top dynamically, repeats summary on each page.

- [ ] Add failing unit tests for calendar boundaries, snapshot copying, filter summary, multi-page PDF summary layout and no metadata leakage. Add browser tests before modifying UI, run one and see missing controls fail.

```js
const q = createAuditLogQuery({period:'today'}, new Date('2026-09-02T16:01:00Z'));
assert.equal(q.from, '2026-09-02T16:00:00.000Z');
assert.equal(q.to, '2026-09-03T16:00:00.000Z');
const week = createAuditLogQuery({period:'7d'}, new Date('2026-09-03T04:00:00Z'));
assert.equal(week.from, '2026-08-27T16:00:00.000Z');
// An export fetch stub mutates the original query after page one, then asserts
// every captured page still carries the original q/entity/from/to/sort values.
```

- [ ] Implement focused helpers. Malaysia is UTC+8 with no DST in supported current dates: compute the local date via Intl.DateTimeFormat(timeZone), derive midnight UTC once, subtract (N-1) days for presets. All returns empty bounds. Freeze/copy returned scalar fields; never pass raw UI state into export.
- [ ] Implement list loading with a single applied `{query,page}` state and request identity/AbortController. Search draft debounces 350ms; filters reset page=1. Superseded or wrong-account responses cannot set visible records or loading state. Derive readiness from successful query/page/account identity, not only stale loading boolean. Disable export during debounce, failed/current loading or active export. Clear restores defaults atomically. Loading/error/empty/result count states are accessible. Retry current failed query without losing filters.
- [ ] Implement toolbar using the Vendors pattern: rounded white controls, blue text, matching shadows/borders/heights; Search label and placeholder clarify supported action/entity/full UUID fields; accessible Entity, Time range and Sort order selects. Export right-aligned; Clear filters only when active, narrow screens wrap. Keep `.admin-audit-log-toolbar` for existing tests.
- [ ] Forward canonical query through API and export:

```js
const snapshot = {...query};
const entries = await fetchAllPages(options => fetchPage({...options,signal}),
  {pageSize:100, params:snapshot});
const report = buildAuditLogReport(entries, new Date(), snapshot);
```

Retain isClosed checks and existing preview wrapper. Query fields must be selected explicitly so page or identity cannot be overridden by arbitrary caller fields.
- [ ] Add PDF filter summary after generated/count; wrap using createPdfText, reserve dynamic header space before drawing the table. Preserve three columns, all records, local fonts, repeated header, no metadata and no partial PDF on failure.
- [ ] Browser tests use deterministic backend fixtures and cover combined filters/total count/order, page reset, clear, no results, stale requests, export disabled while query changes, fixed query across >100 matching rows, mid-export filter change, desktop/mobile controls. Use raw query assertions, not just mocked displayed text. Save a synthetic real PDF and screenshots in ignored `frontend/responsive-output/my-audit-log-filters/`.
- [ ] Run `cd frontend && npm run test:unit`, focused Playwright audit + dashboard regression tests, `npm run build`, `git diff --check`. Only one Playwright server at 5174 at a time. Commit Task 2 files after independent spec/quality review and fixes.

### Task 3: Independent integration and final verification

**Files:**
- Update this plan and approved spec status after verified completion.
- Synthetic QA output only in ignored responsive-output or existing output/pdf; do not commit generated artifacts.

- [ ] Request luna_worker read-only permission and export-consistency review; resolve findings through implementer and scoped re-review.
- [ ] Main independently runs `cd backend && npm test`, `cd frontend && npm run test:unit`, `npm run test:responsive -- tests/responsive/my-audit-log-filters.spec.js tests/responsive/my-audit-log-pdf.spec.js tests/responsive/dashboard-pdf.spec.js tests/responsive/dashboard-model-ui.spec.js tests/responsive/admin-notification-popover.spec.js`, `npm run build`, and `git diff --check`.
- [ ] Render the synthetic exported PDF with Poppler and inspect all pages for summary/table overlap, missing final records, fonts and page order. Extract text to verify filtering/sort labels and record order; do not use production private logs for fixtures.
- [ ] Show the user the updated UI screenshot, report actual verification and any limitations, keep branch locally without push.

## Plan self-review

All approved requirements are assigned to Tasks 1–3. Wire keys are identical across layers; filters are server-side and snapshots are immutable. No database migration, shared admin refactor, external upload, or live private-data export is planned.
