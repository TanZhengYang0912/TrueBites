# Customer Navigation Dedicated Routes Design

## Goal

Make the customer header's Saved, My reviews, and Suggest items navigate to independent pages instead of using local tab state inside the engagement page.

## Routes

- `/saved` renders the saved-places experience.
- `/reviews` renders the customer's reviews experience.
- `/suggestions` remains the suggestions experience.
- `/engagement` redirects to `/saved` for backward compatibility.
- `/engagement?tab=reviews` redirects to `/reviews` for backward compatibility.

The redirects replace the legacy history entry so browser Back does not bounce through an obsolete route.

## Page Architecture

The saved and reviews routes use the existing engagement UI through one shared component with an explicit `section` prop. Route selection, not component state or a query parameter, determines which section is rendered.

The component loads only the data required by the active route:

- Saved loads folders and bookmarks.
- Reviews loads the user's reviews and the bookmarks required for save controls on review cards.

There is no in-page Saved/My reviews tab switch and no `setTab` navigation path.

## Header Navigation

The real-link requirement applies to the three requested customer destinations:

- Saved: `/saved`
- My reviews: `/reviews`
- Suggest: `/suggestions`

Discover intentionally remains its existing callback/button because it participates in the map/list discovery view behavior. It is outside the scope of the requested three dedicated destinations and is not required to become a `/map` link.

Each page supplies the correct active section so `aria-current="page"` and active styling continue to work. Existing authentication gates remain in place: signed-out users who choose a protected destination are sent to sign in.

## Existing Behavior Preserved

- Page layout, filtering, pagination, cards, modals, folder management, and review presentation remain visually unchanged.
- The saved-count badge remains available in the shared header.
- Suggestion creation continues at `/suggestions/new` and returns to `/suggestions`.
- Existing links to legacy engagement URLs continue to work through redirects.

## Error Handling

Each route preserves the existing loading, signed-out, empty, and API-error behavior for the data it owns. A failure in an unrelated section cannot block the current page because unrelated data is no longer requested.

## Testing

Tests will prove that:

1. `/saved`, `/reviews`, and `/suggestions` are independent routes.
2. Header navigation changes the URL and visible page heading.
3. Reloading a route preserves its page.
4. Legacy engagement URLs redirect to the matching new route.
5. Existing saved/review controls and responsive layouts still pass their focused tests.

Implementation follows red-green-refactor: add failing route/navigation tests first, make the smallest production changes to pass, then run unit, responsive, and build verification.
