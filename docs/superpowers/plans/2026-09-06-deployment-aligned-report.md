# Deployment-Aligned Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the existing two-tab Google Doc report so all map/trip statements affected by production deployment `origin/main@919970b` are accurate while preserving the student's backend contribution boundary.

**Architecture:** Treat the production frontend and `origin/main@919970b` as factual authority, and the existing Google Doc as structural authority. Apply narrowly targeted native Google Docs edits to existing paragraphs, table cells, and three diagram objects; then verify the two requirement tables and exported PDF.

**Tech Stack:** Google Docs native API connector, Google Drive PDF export, SVG/PNG diagram assets, Node.js + Sharp for deterministic diagram rendering, production React/Express source as evidence.

## Global Constraints

- Target document ID: `1EiBdJdFPiIqMJzKHmYkajqbMNK7W78zo06wNbwghlr4`.
- Preserve tabs `t.0` and `t.96t9roqtjdf0`, their order, native tables, headings, lists, and unrelated content.
- Preserve `MDV001 — Plan Multi-Stop Trip` and `MDV002 — Optimize Stop Order` with `MDV002 «extend» MDV001` at `Review current trip`.
- Show only `Map User` as a UML actor; label it `Guest or non-admin Registered Customer`.
- Do not attribute shared frontend trip planning or vendor-detail implementation solely to Tan Zheng Yang.
- Do not add a Sprint Backlog: the current assessment template contains no Sprint Backlog field or instruction. A teacher-reviewed older report is therefore unnecessary for this document unless the user later supplies a new template requirement.
- Keep OSRM as an external routing service in flow text, not as a UML actor.
- Distinguish backend `/api/trip` OSRM driving optimization from frontend Google Directions travel-mode display.

---

### Task 1: Capture Current Native Document State

**Files:**
- Read: Google Doc `1EiBdJdFPiIqMJzKHmYkajqbMNK7W78zo06wNbwghlr4`
- Create: immutable trusted-read artifacts under `/Users/tanzhengyang/.codex/visualizations/2026/08/31/01a0598e-dae5-7ee0-b8cb-1d43892689e3/google-doc-trusted-read-09/`

**Interfaces:**
- Consumes: existing Google Doc and deployment-alignment design.
- Produces: current revision ID, exact tab tree, paragraph/table indexes, inline object IDs, and preservation warnings.

- [ ] **Step 1: Run the file-backed trusted read**

Use the checked-in Google Docs trusted-read bridge on the target document with no `tabId`, preserving full two-tab visibility.

- [ ] **Step 2: Inspect affected ranges**

Read the normalized document text and native tables for Section A, B2, B3, C2/C3, D3–D5, Section E, and Tab 2 requirements.

- [ ] **Step 3: Record immutable anchors**

Confirm document title, tab IDs, figure object IDs, exact Actor/Activator cells, FR001–FR018 rows, and one out-of-scope anchor in the originality declaration.

### Task 2: Update Deployment-Affected Text and Requirements

**Files:**
- Modify: Google Doc Tab 1 `t.0`
- Modify: Google Doc Tab 2 `t.96t9roqtjdf0`

**Interfaces:**
- Consumes: deployment facts and live Google Docs ranges from Task 1.
- Produces: source-current report prose and identical FR001–FR018 statements on both tabs.

- [ ] **Step 1: Update Section A module description**

State that `/map` is a public pin-map/trip-planning route, geolocation resolves asynchronously after entry, `/api/trip` provides backend driving optimization, and Car/Motorcycle/Transit/Walking visualization belongs to the frontend Google Directions path.

- [ ] **Step 2: Update B2 Actor/Activator and preconditions**

Use `Map User — Guest or non-admin Registered Customer`; remove obsolete suspended-customer blocking language; state that `/map` is entered directly and sign-in is not required.

- [ ] **Step 3: Update B2 flow and scope details**

Describe immediate map entry followed by optional asynchronous GPS/manual origin, preserve all add/reorder/remove/edit and optimization semantics, and acknowledge that the current in-app vendor-detail modal is outside MDV001/MDV002.

- [ ] **Step 4: Update the 18 functional requirements**

Revise only deployment-affected requirements: eligible actor/access wording, direct `/map` entry, asynchronous GPS, public `/api/trip`, frontend/backend travel-mode boundary, and current in-app vendor-detail scope. Keep optimization thresholds and failure behavior accurate.

- [ ] **Step 5: Mirror all 18 requirements in Tab 2**

Write the same FR001–FR018 strings into the Tab 2 table and verify exact text equality by row ID.

### Task 3: Regenerate And Replace Affected Diagrams

**Files:**
- Modify: `/Users/tanzhengyang/.codex/visualizations/2026/08/31/01a0598e-dae5-7ee0-b8cb-1d43892689e3/trip-diagrams.mjs`
- Regenerate: `use-case-trip.svg`, `use-case-trip.png`, `activity-plan-trip.svg`, `activity-plan-trip.png`, `activity-optimize-order.svg`, `activity-optimize-order.png`
- Modify: three inline image objects in Google Doc Tab 1

**Interfaces:**
- Consumes: finalized B2/B3 semantics from Task 2.
- Produces: use-case and activity diagrams matching the production route and runtime order.

- [ ] **Step 1: Update the use-case diagram actor label**

Keep the two bubbles and arrow direction; change the Map User subtype to `Guest or non-admin Registered Customer`.

- [ ] **Step 2: Update the MDV001 activity flow**

Start with `Navigate to /map`, then model GPS as asynchronous and optional. Preserve manual-origin fallback, trip restoration, stop editing, backend OSRM driving calculation, review, and optional MDV002 activation. Add a scope note that selected Car/Motorcycle/Transit/Walking visualization uses the frontend Directions path.

- [ ] **Step 3: Keep MDV002 focused on backend optimization**

Preserve `Suggest Best Order` as a user-triggered optional extension requiring at least two non-location stops and using `/api/trip` with `optimize=true`.

- [ ] **Step 4: Render and inspect all three source images**

Run `node trip-diagrams.mjs`; inspect each PNG at original resolution for clipped text, crossed labels, and incorrect arrows.

- [ ] **Step 5: Replace the three native inline images**

Delete and reinsert each image at its live connector-resolved object position, using the nearest existing size as the baseline and the current document revision guard.

### Task 4: Correct D/E Integration Explanations

**Files:**
- Modify: Google Doc Tab 1 `t.0`

**Interfaces:**
- Consumes: unchanged D1–D5 code excerpts and production integration facts.
- Produces: accurate explanations without rewriting unaffected reflections.

- [ ] **Step 1: Narrow D3 explanation**

Explain that the backend provides initial proximity sorting/rough ETA from the supplied reference point, while the frontend recalculates displayed distances when a real GPS/manual origin exists.

- [ ] **Step 2: Clarify D4/D5 scope**

State that `/api/route` and Google-to-OSRM fallback are broader single-route backend services and are not the current request chain for MDV001/MDV002, which uses `/api/trip`.

- [ ] **Step 3: Reconcile affected E statements**

Update only sentences that imply all displayed travel modes use Tan's backend route service or that the old suspended-user restriction still exists. Preserve all unaffected personal learning and reflection.

### Task 5: Connector And Rendered Verification

**Files:**
- Create: final trusted-read artifacts in a new immutable directory
- Create: final PDF QA export and raster pages under the visualization workspace

**Interfaces:**
- Consumes: settled Google Doc from Tasks 2–4.
- Produces: evidence that semantics, native structure, and rendered pages pass.

- [ ] **Step 1: Re-read native document state**

Confirm document ID/title, both tabs, three image objects, Actor/Activator fields, and every affected paragraph.

- [ ] **Step 2: Verify requirements parity and preservation anchors**

Confirm Tab 1 and Tab 2 contain identical FR001–FR018 statements, the originality declaration is unchanged, and no unrelated D/E code paragraph changed.

- [ ] **Step 3: Export and rasterize the final PDF**

Export the Google Doc as `application/pdf`, run `pdfinfo`, rasterize every page with `pdftoppm`, and inspect all pages for clipping, overlap, missing images, broken tables, or stranded headings.

- [ ] **Step 4: Run independent read-only deployment review**

Ask the existing `luna_worker` reviewer to compare the final report with `origin/main@919970b` and report only substantive mismatches.

- [ ] **Step 5: Deliver the updated Google Doc**

Return the canonical Google Doc link, summarize deployment-driven changes, and state any pre-existing placeholders or remaining visual limitations precisely.
