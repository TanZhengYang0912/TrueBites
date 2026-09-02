# Customer Navigation Dedicated Routes Design

## Goal

Make the customer header's Saved, My reviews, and Suggest items ordinary page-navigation buttons. Each destination must render its own page component instead of selecting a section inside a shared engagement page, and the navigation must not look or behave like an in-page tab strip.

## Routes

- `/saved` renders the saved-places experience.
- `/reviews` renders the customer's reviews experience.
- `/suggestions` remains the suggestions experience.
- `/engagement` redirects to `/saved` for backward compatibility.
- `/engagement?tab=reviews` redirects to `/reviews` for backward compatibility.

The redirects replace the legacy history entry so browser Back does not bounce through an obsolete route.

## Page Architecture

The routes render separate top-level page components:

- `/saved` renders `SavedPage`.
- `/reviews` renders `ReviewsPage`.
- `/suggestions` renders the existing `SuggestionsPage`.

`SavedPage` owns folder state, bookmark pagination, folder creation/deletion, bookmark movement, and the saved-place detail interactions. `ReviewsPage` owns review filters, sorting, pagination, and review-card interactions. Reviews may load bookmark data only where the existing save/remove controls require it.

Shared presentation and interaction pieces may remain reusable components, including the customer shell, header, page intro, vendor cards, vendor-detail modal, folder picker, toast, and narrowly scoped engagement helpers. A shared component must not accept a `section`, `tab`, or equivalent mode prop that decides which complete page to display.

There is no in-page Saved/My reviews switch, no `setTab` path, and no top-level `EngagementPage` selecting between the two destinations.

## Header Navigation

The real-link requirement applies to the three requested customer destinations:

- Saved: `/saved`
- My reviews: `/reviews`
- Suggest: `/suggestions`

Discover intentionally remains its existing callback/button because it participates in the map/list discovery view behavior. It is outside the scope of the requested three dedicated destinations and is not required to become a `/map` link.

The three destinations remain semantic links so normal browser history, Back/Forward, direct URLs, and reloads work. They navigate in the current browser tab; they do not open extra browser tabs.

The header presents them as ordinary navigation buttons, not a segmented control or tab strip. The current destination may retain a restrained text-colour or underline indicator together with `aria-current="page"`, but it must not use the filled rounded block that currently resembles a selected tab.

Existing authentication gates remain in place: signed-out users who choose a protected destination are sent to sign in.

## Existing Behavior Preserved

- Page content layout, filtering, pagination, cards, modals, folder management, and review presentation remain visually unchanged.
- The saved-count badge remains available in the shared header.
- Suggestion creation continues at `/suggestions/new` and returns to `/suggestions`.
- Existing links to legacy engagement URLs continue to work through redirects.

## Error Handling

Each route preserves the existing loading, signed-out, empty, and API-error behavior for the data it owns. A failure in an unrelated section cannot block the current page because unrelated data is no longer requested.

## Testing

Tests will prove that:

1. `/saved`, `/reviews`, and `/suggestions` render three independent page components.
2. No shared top-level page selects Saved versus Reviews through a `section`, `tab`, or equivalent mode prop.
3. Header navigation changes the URL and visible page heading in the current browser tab.
4. Header navigation uses link semantics without the filled tab-like active style.
5. Reloading a route preserves its page.
6. Legacy engagement URLs redirect to the matching new route.
7. Existing saved/review controls and responsive layouts still pass their focused tests.

Implementation follows red-green-refactor: add failing route/navigation tests first, make the smallest production changes to pass, then run unit, responsive, and build verification.
