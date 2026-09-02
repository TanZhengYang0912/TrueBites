# Discovery Search and Community CTA Swap — Design QA

## Comparison target

- Source visual truth: `/var/folders/2k/9gm24jc16p513yff3zkk7lmw0000gn/T/codex-clipboard-47c435b4-31f2-4310-a887-8f1d9ff6d8fb.png`
- Final desktop implementation: `/var/tmp/truebites-discovery-swap-desktop-passed.png`
- Final mobile implementation: `/var/tmp/truebites-discovery-swap-mobile-passed.png`
- Normalized full-view comparison: `/var/tmp/truebites-discovery-swap-comparison-passed.png`
- Route and state: `/map`, default search and filters, 300-vendor discovery state.

## Capture normalization

- Source pixels: 2706 × 576. The source is a main-content crop captured at approximately 1.5× density.
- Source normalized comparison size: 1804 × 384 at 1× density.
- Desktop implementation viewport: 1804 × 576 CSS px, device scale factor 1.
- Desktop comparison crop: implementation y=72–456, producing 1804 × 384 px to exclude browser-owned page header and align with the source's main-content crop.
- Mobile implementation viewport: 375 × 900 CSS px, device scale factor 1.
- The normalized comparison places the source above the final implementation in one 1804 × 788 image with a 20px separator.

## Evidence

The combined comparison shows the requested spatial exchange: the Community Discoveries CTA now occupies the former 300–420px search column, while search spans the full content row previously occupied by the CTA. The final CTA preserves its forest background, lightbulb icon, eyebrow, prompt, and desktop `Share it` action. The search retains its original height, border, icon, placeholder, and focus affordance.

The component is already large and readable in the normalized full-view comparison, so a separate focused desktop crop would duplicate the same evidence. The 375 × 900 mobile capture is the additional focused responsive evidence: title, CTA, and search stack in order without horizontal overflow, and the CTA uses an icon-only action at that width.

## Required fidelity surfaces

- Fonts and typography: Existing display and body font families, weights, italics, line heights, and tracking are preserved. Compact CTA type scales down without losing hierarchy or clipping.
- Spacing and layout rhythm: Desktop grid tracks remain `minmax(0,1fr)` and `minmax(300px,420px)`. The full-width search aligns with the content frame. Mobile spacing is even and no control crosses the viewport.
- Colors and visual tokens: Existing chalk, forest, terracotta, sand, ink, muted, and white tokens remain unchanged.
- Image quality and asset fidelity: The supplied mascot and Lucide lightbulb/arrow icons remain sharp and correctly scaled; no placeholder or code-drawn replacement was introduced.
- Copy and content: Hero, vendor count, search placeholder, Community Discoveries eyebrow, prompt, and desktop `Share it` action are preserved.

## Interaction checks

- In the authenticated in-app browser, entering `Chef Wan` in the relocated search reduced the vendor results to Chef Wan's Cafe, confirming immediate filtering still works.
- Clicking the compact Community Discoveries CTA opened `/suggestions/new`.
- The suggestion form Back action returned to `/map`.
- No broken or error state appeared during these checks.

## Comparison history

### Iteration 1

- Finding [P2]: the compact desktop CTA showed only an arrow, while the source CTA explicitly labeled the action `Share it →`. This weakened the desktop affordance and was a visible copy mismatch.
- Fix: added a responsive action treatment that shows `Share it` with a Lucide ArrowRight from `sm` upward, while retaining an icon-only action on narrow mobile screens.
- Post-fix evidence: `/var/tmp/truebites-discovery-swap-comparison-passed.png` shows the desktop label restored; `/var/tmp/truebites-discovery-swap-mobile-passed.png` shows the mobile CTA remains uncluttered and does not overflow.

## Findings

No actionable P0, P1, or P2 differences remain. No P3 follow-up is required for the requested swap.

## Implementation checklist

- [x] Community Discoveries moved to the hero's right column.
- [x] Search moved to the full-width row below the hero.
- [x] Desktop and mobile CTA actions remain clear.
- [x] Search and CTA interactions remain functional.
- [x] Desktop and mobile layouts have no horizontal overflow.

final result: passed
