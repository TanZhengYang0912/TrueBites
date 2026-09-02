# Advanced discovery filters — design QA

## Comparison target

- Source visual truth: `docs/screenshots/advanced-filters-reference.png`
- Rendered desktop implementation: `docs/screenshots/advanced-filters-desktop.jpg`
- Rendered mobile implementation: `docs/screenshots/advanced-filters-mobile.jpg`
- Focused side-by-side evidence: `docs/screenshots/advanced-filters-comparison.png`
- Route: `http://localhost:5173/map`
- Theme/state: light theme; List view; filters expanded on desktop and collapsed by default on mobile; API-backed vendor data loaded.

## Capture and normalization

- Source pixels: 1998 × 558.
- Desktop implementation pixels: 1585 × 892, captured from an explicit 1600 × 900 CSS viewport override in the Codex in-app browser.
- Mobile implementation pixels: 375 × 812, captured from an explicit 390 × 844 CSS viewport override in the same browser.
- Focused comparison pixels: 1270 × 917. The source was proportionally normalized to 1270 px wide; the implementation filter region was cropped at its native density to the same 1270 px width. No device frame or browser chrome was included in the focused comparison.
- Density: both artifacts were treated as 1× raster evidence after width normalization. No finding was based on antialiasing or density-only differences.

## Full-view comparison evidence

The desktop capture preserves the reference hierarchy: creator filter and clear/collapse actions first, a divider, then the five reliable primary filters, followed by availability and result/sort feedback. The TrueBites implementation deliberately omits Dietary options, Amenities, Vibe, and Crowd level because the current vendor records do not provide reliable fields for them. It uses the existing TrueBites chalk, forest, sand, ink, display, and body tokens rather than copying the reference application's neutral theme.

At 390 px, the panel defaults to collapsed, the creator control and actions remain readable, and the filter controls expand into a single column. The header, hero, search, and results retain their hierarchy without horizontal overflow.

## Focused region comparison evidence

`docs/screenshots/advanced-filters-comparison.png` places the normalized source and rendered filter panel in one image. It confirms:

- Fonts and typography: labels, control text, result count, and actions use a consistent TrueBites body hierarchy; no clipped or cramped text was observed.
- Spacing and layout rhythm: creator/actions, dividers, five-column desktop grid, controls, location hint, result count, and sort are aligned and consistently spaced.
- Colors and tokens: semantic disabled states, forest actions, sand borders, and white surfaces map cleanly to the existing product system with sufficient contrast.
- Image quality and assets: the filter panel contains no target imagery; all visible symbols use the existing Lucide icon family, with no placeholder, CSS-drawn, or custom SVG substitutions.
- Copy and content: labels and option ranges are concise, locally relevant (RM and kilometres), and coherent without the reference application's unsupported fields.

## Interaction and responsive evidence

- Category selection changed the List result count from 300 to 178 and updated the visible cards.
- Rating 4.5+ changed the Map result count to 4 and reduced the rendered map pins/clusters to the same four vendors.
- Returning from Map to List preserved the 4.5+ state and the same four results.
- Distance and Nearest stay disabled until a real location is available, with an explanatory hint.
- Mobile loaded with `Show filters`; expanding it revealed a one-column filter stack.
- The in-app browser console contained no warnings or errors during the final pass.
- Focused Playwright coverage passed 9/9 scenarios, including filter reset, pagination reset, location success/failure, and one-result List/Map consistency.
- The complete responsive Playwright suite passed 122/122 scenarios across customer and admin routes.

## Findings

- No actionable P0, P1, or P2 visual or interaction differences remain.
- [P3] The pre-existing global trip FAB can overlap a small portion of the lower-right edge of a control at narrow viewport scroll positions. The controls remain usable from the rest of their full-width target, and this does not block the filtering flow. A future polish pass could integrate the trip shortcut into the mobile header or reserve a dedicated safe area.

## Open questions

- Dietary options, Amenities, Vibe, and Crowd level remain intentionally deferred until those attributes have a trustworthy source in the vendor model.

## Comparison history

- Pass 1: no P0/P1/P2 mismatch was found. The first evidence capture occurred before vendor loading completed, so it was replaced with a post-load capture; this was an evidence correction, not a visual implementation fix.
- Post-load evidence: desktop and mobile layouts, selected-filter behavior, List/Map synchronization, responsive collapse, and console state were rechecked. No P0/P1/P2 finding was introduced.

## Implementation checklist

- [x] Match the reference filter hierarchy with supported TrueBites data.
- [x] Keep desktop expanded and mobile collapsed by default.
- [x] Keep List cards, Map pins, and Map sidebar synchronized.
- [x] Verify disabled location-dependent states and clear explanations.
- [x] Verify typography, spacing, tokens, icons, copy, responsiveness, and console state.

final result: passed
