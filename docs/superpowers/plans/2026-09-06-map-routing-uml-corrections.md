# Map Routing UML Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Map Routing use-case and activity diagrams, then synchronize the affected Google Doc terminology and verify the exported report.

**Architecture:** A deterministic Pillow renderer will create three high-resolution UML figures from fixed coordinates so actor associations, swimlanes, arrows, and labels remain predictable. Google Docs native batch-update requests will replace only the existing figures and affected text, preserving both tabs and all unrelated report content.

**Tech Stack:** Python 3, Pillow 12.3.0, Google Drive/Docs connector, Google Docs PDF export, pdfplumber.

## Global Constraints

- Use-case boundary text is `TrueBites — Map Routing`.
- Use-case actors are separate `Guest` and `Registered User` actors.
- Both actors associate only with `Plan Multi-Stop Trip`.
- `Optimize Stop Order` has one dashed `«extend»` arrow pointing to `Plan Multi-Stop Trip` and no direct actor association.
- Both activity diagrams use the approved three swimlanes: `Guest / Registered User`, `TrueBites Frontend`, and `Map Routing Backend / OSRM`.
- Preserve MDV001 and MDV002 in textual traceability fields, but not inside use-case bubbles.
- Preserve Tab 1 and Tab 2 structure and all unrelated content.

---

### Task 1: Deterministic UML Figure Renderer

**Files:**
- Create: `scripts/render_map_routing_uml.py`
- Create: `output/diagrams/map-routing-use-case.png`
- Create: `output/diagrams/map-routing-activity-plan-trip.png`
- Create: `output/diagrams/map-routing-activity-optimize.png`

**Interfaces:**
- Consumes: the terminology and relationships in `docs/superpowers/specs/2026-09-06-map-routing-uml-corrections-design.md`.
- Produces: three PNG files accepted by Google Docs `insertInlineImage`.

- [ ] **Step 1: Implement shared drawing primitives**

Create Pillow helpers for wrapped text, actor figures, ellipses, rounded activity boxes, decision diamonds, solid arrows, dashed dependency arrows, and swimlane headers. Use `DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`; use a white background, black UML strokes, and pale-blue lane headers.

- [ ] **Step 2: Render the use-case diagram**

Draw two human actors outside the system boundary. Draw only the two approved use-case bubbles. Add solid associations from each actor to `Plan Multi-Stop Trip`, then add a dashed `«extend»` arrow from `Optimize Stop Order` to `Plan Multi-Stop Trip`.

- [ ] **Step 3: Render both swimlane activity diagrams**

Place every activity inside its responsible lane. The plan-trip figure must show asynchronous map opening/GPS, stop editing, point validation, optimized/current-order request selection, success/failure handling, route display, trip review, and the optional transition to optimization. The optimize figure must show the explicit user request, backend validation, OSRM processing, normalized output, success/failure handling, review, and return to the base use case.

- [ ] **Step 4: Run deterministic output checks**

Run:

```bash
"/Users/tanzhengyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" scripts/render_map_routing_uml.py
"/Users/tanzhengyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" - <<'PY'
from PIL import Image
from pathlib import Path
paths = sorted(Path('output/diagrams').glob('map-routing-*.png'))
assert len(paths) == 3
for path in paths:
    image = Image.open(path)
    assert image.mode == 'RGB'
    assert image.width >= 1800
    assert image.height >= 1000
    print(path, image.size)
PY
```

Expected: three RGB PNG paths and dimensions, with no assertion failure.

- [ ] **Step 5: Visually inspect all three figures**

Open each PNG at original resolution and confirm that no arrow crosses text, the `«extend»` arrow points upward to the base use case, and every activity remains inside one visible swimlane.

### Task 2: Google Doc Terminology and Figure Replacement

**Files:**
- Modify: Google Doc `1EiBdJdFPiIqMJzKHmYkajqbMNK7W78zo06wNbwghlr4`, Tab 1 and the matching FR001 cell in Tab 2.

**Interfaces:**
- Consumes: the three PNG outputs from Task 1 and a fresh trusted document read.
- Produces: a revision-controlled Google Doc with synchronized text and figures.

- [ ] **Step 1: Perform the required trusted read**

Run the Google Docs trusted-read bridge against the exact document and inspect control warnings, tab topology, current revision, affected text ranges, figure object IDs, and table-cell ranges.

- [ ] **Step 2: Update Section A and B terminology**

Replace the module-assigned value with `Map Routing`. Update the Module Description reference to `Guest and Registered User`. Update the B1 caption and both B2 Actor / Activator values to the approved wording without changing table structure.

- [ ] **Step 3: Update FR001 consistently in both tabs**

Change the actor phrase to `guests and registered users` while preserving the current public-map access rule. Make the same wording change in Tab 1 B3 and Tab 2 FR001.

- [ ] **Step 4: Replace the three figures**

Delete and reinsert the existing B1(b), C2.1, and C2.2 inline-image objects at their live indices. Size each image to the report text width while preserving aspect ratio, center each image paragraph, and preserve surrounding captions and page breaks.

- [ ] **Step 5: Read back native structure**

Confirm two tabs remain, the three new image objects are present and centered, MDV identifiers remain in text only, and no stale `Map User` or `Backend Map Visualization Module` wording remains in the corrected scope.

### Task 3: Report Export and Verification

**Files:**
- Create or replace: `output/pdf/TrueBites-Report-Map-Routing-UML-final.pdf`
- Create: `tmp/pdfs/map-routing-uml-final/page-*.png`

**Interfaces:**
- Consumes: the corrected Google Doc from Task 2.
- Produces: a visually verified PDF and machine-readable audit evidence.

- [ ] **Step 1: Export the native Google Doc to PDF**

Use the connected Google Docs browser surface to export the full document and copy it to the stable output path.

- [ ] **Step 2: Rasterize every PDF page**

Run:

```bash
pdftoppm -png -r 120 output/pdf/TrueBites-Report-Map-Routing-UML-final.pdf tmp/pdfs/map-routing-uml-final/page
```

Expected: one PNG for every PDF page.

- [ ] **Step 3: Inspect the affected pages and pagination boundaries**

Confirm the use-case diagram is readable, both activity diagrams show three swimlanes, no figure or caption is split incorrectly, and Section C3 still begins cleanly after the activity figures.

- [ ] **Step 4: Run text verification**

Use pdfplumber to assert that `Map Routing`, `Guest`, `Registered User`, `Plan Multi-Stop Trip`, `Optimize Stop Order`, and `«extend»` occur in the exported report, while `Backend Map Visualization Module` and the merged actor label `Map User` do not remain in the corrected sections.

- [ ] **Step 5: Independent final review**

Ask the existing UML reviewer to verify the final PDF against every acceptance criterion and report PASS or FAIL without editing files.
