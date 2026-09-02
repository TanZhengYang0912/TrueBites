# Discovery Search and Community CTA Swap

## Goal

Swap the desktop positions and widths of the discovery search field and the Community Discoveries call to action without changing their behavior.

## Desktop layout

- Keep the existing two-column discovery hero grid.
- Place the Community Discoveries CTA in the right hero column previously occupied by the search field.
- Size the CTA to that column, approximately 300–420px depending on the viewport.
- Move the search field below the hero grid into the full-width row previously occupied by the Community Discoveries CTA.
- Keep the full-width search field at its existing input height; it must not inherit the CTA banner's taller visual treatment.
- Reduce the compact CTA's internal spacing and typography as needed so its icon, label, prompt, and action remain readable without wrapping awkwardly.

## Responsive layout

- At widths below the existing large-screen breakpoint, preserve a natural single-column flow.
- Order the content as hero title, compact Community Discoveries CTA, then full-width search.
- Both controls must fit the viewport without horizontal overflow.

## Behavior

- Search remains controlled by the existing `search` state and continues to filter vendors immediately.
- The Community Discoveries CTA continues to use the existing authentication guard and navigates to `/suggestions/new` when allowed.
- No API, routing, authentication, or vendor-card behavior changes are in scope.

## Accessibility

- Preserve the search input's `aria-label` and visible placeholder.
- Preserve the CTA as a keyboard-accessible button with its existing click behavior.
- Maintain visible focus treatment and at least 44px interactive height.

## Verification

- Add a focused source or browser assertion that the compact CTA is inside the hero grid and the search row follows it at full width.
- Verify desktop and mobile layouts in Playwright.
- Run the frontend unit suite and production build.
- Inspect the live page to confirm the two elements have exchanged positions and corresponding widths.
