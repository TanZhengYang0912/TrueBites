# Advanced Discovery Filters Design

## Goal

Expand TrueBites discovery from search, category, and creator filters into a reliable filtering system backed only by fields the product already stores. The same filter state and matching rules must drive the discovery list, map pins, and map vendor sidebar so switching views never changes the result set unexpectedly.

## Scope

This iteration includes:

- Search
- Category
- Recommended by creator
- Price range
- Operating-hours period
- Minimum rating
- Distance
- Open now
- Result sorting
- Clear all
- Responsive expanded/collapsed filter panel

This iteration does not add Dietary options, Amenities, Vibe, or Crowd level. The vendor schema and admin workflow do not currently collect reliable values for those concepts, so exposing those controls would create filters that are visual rather than truthful.

## User Experience

### Discovery list

The existing full-width search remains above a new bordered filter panel styled with TrueBites forest, terracotta, sand, ink, and chalk tokens.

On desktop the panel is expanded by default. Its header contains Recommended by, Clear all, and Hide filters. Its main control grid contains Category, Price range, Operating hours, Rating, and Distance, followed by an Open now toggle. Beneath the panel, the page shows the filtered result count and a Sort by control.

On mobile the panel is collapsed by default behind a Filters button. Opening it reveals a single-column stack of full-width controls. The layout must not introduce horizontal scrolling and all interactive targets must remain at least 44 pixels high.

### Map view

The map vendor sidebar uses the same filter state and options in a compact layout. The full-width discovery list and the map do not maintain separate copies of the active values.

Changing a filter updates all of the following immediately:

- Discovery cards
- Discovery result count
- Map pins
- Map vendor sidebar results

Switching between List and Map preserves the active filters. Changing any filter resets discovery pagination to page 1.

### Empty and unavailable states

If no vendors match, the empty state explains that the active filters produced no results and offers Clear filters.

If the user has not set a usable location, Distance and Nearest are disabled and display a short explanation that a starting location is required. Other filters continue working.

## Filter Semantics

All active filters combine using AND.

### Search

Case-insensitive matching against vendor name, cuisine types, and signature dishes.

### Category

Uses the existing cuisine-category mapping and the current category inventory derived from vendor data.

### Recommended by

Uses the existing creator handle derived from a vendor's source video URL or source platform.

### Price range

Options:

- Any price
- Under RM10
- RM10-RM20
- RM20-RM40
- RM40+

The parser extracts the numeric minimum and maximum from the stored `price_range`. A vendor matches when its stored range overlaps the selected bucket. A single stored amount is treated as both minimum and maximum. When a price filter is active, an unparseable or missing value does not match.

### Operating hours

Options:

- Anytime
- Breakfast: 06:00-11:00
- Lunch: 11:00-15:00
- Dinner: 17:00-22:00
- Late night: 22:00-02:00

A vendor matches when its reliably parsed operating window overlaps the selected period. Overnight ranges are supported. When an hours filter is active, an unparseable or missing value does not match.

### Rating

Options:

- Any rating
- 3.0+
- 4.0+
- 4.5+

The rule uses `average_rating`. Missing ratings do not match an active minimum-rating filter.

### Distance

Options:

- Any distance
- Within 1 km
- Within 2 km
- Within 5 km
- Within 10 km

The rule uses the existing Haversine-derived `distKm` value returned for the active starting location. Vendors without a numeric distance do not match an active distance filter.

### Open now

Uses the current time in the `Asia/Kuala_Lumpur` timezone, independent of the browser's local timezone. A reliably parsed operating range matches when that time falls inside it, including ranges that cross midnight. Missing or unparseable hours do not match while Open now is enabled.

### Sorting

Options:

- Most relevant: preserve the existing vendor order
- Highest rated: rating descending, then review count descending, then original order
- Nearest: distance ascending, then original order
- Price: low to high: parsed minimum price ascending, then original order

Missing values sort after known values. Nearest is unavailable until a usable location exists.

## Architecture

`MapPage` owns one complete filter object and one sort value. It passes them, plus a patch-style update callback and clear callback, to both `Dashboard` and `VendorPanel`.

`frontend/src/lib/vendorFilters.js` remains the single source of truth for matching. It will provide:

- Default filter values
- Price parsing and bucket overlap
- Operating-window parsing and overlap
- Kuala Lumpur open-now evaluation
- The expanded `matchesFilters` predicate
- Active-filter detection
- Stable sorting

The parsing and filtering functions remain UI-independent and accept an injected current time where necessary, making behavior deterministic in tests.

A reusable `AdvancedFilters` component renders the shared controls. A `compact` presentation option changes layout only; it does not change available values or behavior. Existing `FilterChips` category and creator logic can be reused or folded into the new component without duplicating matching rules.

The filtering pipeline is:

1. MapPage loads the current vendor set, including distance when a starting point is available.
2. The shared predicate applies search and all active filter conditions.
3. The stable sorter orders the matching vendors.
4. Dashboard paginates the sorted results.
5. Map pins and VendorPanel consume the same filtered, sorted set, applying only their existing map-visibility or radius concerns afterward.

## Error Handling and Data Integrity

- Missing or malformed optional data never throws.
- Inactive filters never hide a vendor because a field is missing.
- An active field-specific filter excludes records whose value cannot be evaluated reliably.
- Time and price parsers do not infer values from arbitrary review-summary prose.
- Clear all restores search, category, creator, price, hours, rating, distance, open-now, and sort defaults in one action.
- Existing load and retry behavior remains unchanged.

## Accessibility

- Every select and toggle has a visible label and accessible name.
- Expand/collapse exposes `aria-expanded` and identifies the controlled region.
- Open now communicates checked state through a native checkbox or switch semantics.
- Clear all is disabled when no filter or non-default sort is active.
- Focus indicators use existing TrueBites focus styles.
- Mobile targets remain at least 44 by 44 pixels.

## Testing

### Unit tests

Cover:

- Each filter independently
- AND combinations
- Clear/default-state detection
- Price parsing and bucket overlap
- Daytime and overnight hours overlap
- Open-now evaluation with an injected Kuala Lumpur time
- Missing and malformed fields
- Every sort option and stable tie behavior
- Location-dependent controls

### Integration/source tests

Verify that:

- MapPage owns and passes shared state to both views
- Dashboard resets pagination after relevant filter changes
- Cards, pins, and sidebar use the same predicate output
- Clear all resets every advanced value

### Responsive/browser verification

At desktop and mobile widths, verify:

- Desktop filters start expanded
- Mobile filters start collapsed
- Expand/collapse works
- No horizontal overflow
- Result count updates
- List/Map switching retains values
- Distance and Nearest disable without a location
- Representative combined filters produce matching cards and pins

Visual QA compares the reference screenshot and implementation at a matching desktop viewport, then separately checks the approved mobile stacking behavior.

## Success Criteria

- All eight approved filtering/sorting capabilities are functional, not decorative.
- List and Map show consistent results for the same state.
- No unsupported vendor attributes are fabricated.
- Missing data fails safely only when the corresponding filter is active.
- Desktop and mobile layouts follow the approved expansion behavior.
- Existing discovery, map, pagination, trip, and engagement tests continue to pass.
