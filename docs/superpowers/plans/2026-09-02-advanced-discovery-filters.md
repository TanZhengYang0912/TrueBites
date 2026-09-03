# Advanced Discovery Filters Implementation Plan

> **Post-implementation update (2026-09-02):** The user removed the customer-facing `Sort by` control. `MapPage`, `Dashboard`, `VendorPanel`, and `AdvancedFilters` no longer own or pass mutable sort state; results use the fixed default order. Historical sort steps below document the original implementation plan and are superseded by this update.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight reliable discovery filtering and sorting capabilities that stay synchronized across the TrueBites list, map pins, and map vendor sidebar.

**Architecture:** `MapPage` will own one canonical filter object and sort value, decorate vendors with distance only when a real or explicitly selected origin exists, and derive one filtered/sorted collection. Pure parsing, matching, and sorting stay in `vendorFilters.js`; a reusable `AdvancedFilters` component renders either the full discovery panel or compact map-sidebar controls.

**Tech Stack:** React 18, React Router, Tailwind CSS 4, Lucide React, Node.js test runner, Playwright responsive tests, existing Haversine utilities.

## Global Constraints

- Use only existing vendor fields: `cuisine_types`, `source_video_url`, `source_platform`, `price_range`, `operating_hours_raw`, `operating_hours`, `average_rating`, `review_count`, coordinates, and derived `distKm`.
- Do not add Dietary options, Amenities, Vibe, or Crowd level in this iteration.
- Active filters combine using AND.
- Use `Asia/Kuala_Lumpur` for Open now, independent of the browser timezone.
- Do not infer price or hours from review-summary prose.
- List cards, map pins, and map sidebar results must share one state and one matching result.
- Desktop filters start expanded; mobile filters start collapsed.
- Mobile interactive targets are at least 44 by 44 pixels and the panel must not overflow horizontally.
- Missing data remains visible when its filter is inactive and fails safely when its filter is active.

---

## File Structure

- Modify `frontend/src/lib/vendorFilters.js`: pure defaults, parsers, filter predicate, active-state detection, and stable sorter.
- Modify `frontend/src/lib/vendorFilters.test.mjs`: deterministic unit coverage for every rule and edge case.
- Create `frontend/src/components/discovery/AdvancedFilters.jsx`: reusable full/compact filter controls and responsive expand/collapse behavior.
- Modify `frontend/src/pages/MapPage.jsx`: canonical state, location-aware distance decoration, one derived result collection, and shared props.
- Modify `frontend/src/components/Dashboard.jsx`: controlled filter UI, result count, sorting, pagination reset, and filtered cards.
- Modify `frontend/src/components/VendorPanel.jsx`: compact shared filter UI and removal of duplicate local filter controls.
- Create `frontend/src/lib/advancedFilterWiring.test.mjs`: source-level contract checks for canonical state and shared collection wiring.
- Create `frontend/tests/responsive/discovery-advanced-filters.spec.js`: desktop/mobile behavior and List/Map persistence coverage.
- Create or update `design-qa.md`: reference-versus-implementation visual QA record with no machine-local absolute paths.

---

### Task 1: Build the pure filter and sorting engine

**Files:**
- Modify: `frontend/src/lib/vendorFilters.js`
- Modify: `frontend/src/lib/vendorFilters.test.mjs`

**Interfaces:**
- Consumes: existing `categoryMatches(vendor, key)` and `creatorHandle(vendor)` from `vendorDisplay.js`.
- Produces: `DEFAULT_VENDOR_FILTERS`, `DEFAULT_VENDOR_SORT`, `parsePriceRange(value)`, `parseOperatingWindow(value)`, `matchesFilters(vendor, filters, options)`, `filtersActive(filters, sort)`, and `sortVendors(vendors, sort)`.
- `matchesFilters` options shape: `{ now?: Date }`; tests inject `now`, production defaults to the current instant.

- [ ] **Step 1: Replace the narrow tests with failing coverage for defaults, price, hours, rating, distance, open-now, AND behavior, and sorting**

Add imports and fixtures in `frontend/src/lib/vendorFilters.test.mjs`:

```js
import {
  DEFAULT_VENDOR_FILTERS,
  DEFAULT_VENDOR_SORT,
  filtersActive,
  matchesFilters,
  parseOperatingWindow,
  parsePriceRange,
  sortVendors,
} from "./vendorFilters.js";

const COMPLETE = {
  id: "complete",
  name: "Nancy's Kitchen",
  cuisine_types: "Nyonya / Peranakan",
  signature_dishes: "Ayam Pongteh, Cendol",
  source_video_url: "https://www.tiktok.com/@melakafoodie/video/123",
  price_range: "RM 10 - RM 20 per person",
  operating_hours_raw: "09:00 AM - 11:00 PM",
  average_rating: 4.6,
  review_count: 25,
  distKm: 1.4,
};

test("exports the complete default contract", () => {
  assert.deepEqual(DEFAULT_VENDOR_FILTERS, {
    search: "", category: "all", creator: "all", price: "all",
    hours: "any", rating: "any", distance: "any", openNow: false,
  });
  assert.equal(DEFAULT_VENDOR_SORT, "relevant");
});

test("parses ranges and single prices without reading prose", () => {
  assert.deepEqual(parsePriceRange("RM 10 - RM 20 per person"), { min: 10, max: 20 });
  assert.deepEqual(parsePriceRange("RM8 per person"), { min: 8, max: 8 });
  assert.equal(parsePriceRange("affordable and delicious"), null);
});

test("price buckets overlap stored ranges", () => {
  assert.equal(matchesFilters(COMPLETE, { price: "under-10" }), false);
  assert.equal(matchesFilters(COMPLETE, { price: "10-20" }), true);
  assert.equal(matchesFilters({ ...COMPLETE, price_range: "RM 35 - RM 55" }, { price: "40-plus" }), true);
  assert.equal(matchesFilters({ ...COMPLETE, price_range: null }, { price: "10-20" }), false);
});

test("parses daytime and overnight operating windows", () => {
  assert.deepEqual(parseOperatingWindow("09:00 AM - 11:00 PM"), { open: 540, close: 1380 });
  assert.deepEqual(parseOperatingWindow("10:00 PM - 02:00 AM"), { open: 1320, close: 120 });
  assert.equal(parseOperatingWindow("usually evenings"), null);
});

test("operating-period filters use overlap, including late night", () => {
  assert.equal(matchesFilters(COMPLETE, { hours: "lunch" }), true);
  assert.equal(matchesFilters(COMPLETE, { hours: "late-night" }), true);
  assert.equal(matchesFilters({ ...COMPLETE, operating_hours_raw: "06:00 AM - 10:00 AM" }, { hours: "dinner" }), false);
});

test("open now evaluates Asia Kuala Lumpur time deterministically", () => {
  const openInstant = new Date("2026-09-02T05:00:00.000Z"); // 13:00 MYT
  const closedInstant = new Date("2026-09-02T16:30:00.000Z"); // 00:30 MYT
  assert.equal(matchesFilters(COMPLETE, { openNow: true }, { now: openInstant }), true);
  assert.equal(matchesFilters(COMPLETE, { openNow: true }, { now: closedInstant }), false);
});

test("rating and distance require known values when active", () => {
  assert.equal(matchesFilters(COMPLETE, { rating: "4.5" }), true);
  assert.equal(matchesFilters(COMPLETE, { distance: "2" }), true);
  assert.equal(matchesFilters({ ...COMPLETE, average_rating: null }, { rating: "3" }), false);
  assert.equal(matchesFilters({ ...COMPLETE, distKm: undefined }, { distance: "2" }), false);
});

test("all active filters combine with AND", () => {
  assert.equal(matchesFilters(COMPLETE, {
    search: "cendol", category: "nyonya", creator: "@melakafoodie",
    price: "10-20", hours: "dinner", rating: "4.5", distance: "2",
  }), true);
  assert.equal(matchesFilters(COMPLETE, {
    search: "cendol", category: "nyonya", price: "under-10",
  }), false);
});

test("active-state detection includes advanced filters and sort", () => {
  assert.equal(filtersActive(DEFAULT_VENDOR_FILTERS, DEFAULT_VENDOR_SORT), false);
  assert.equal(filtersActive({ ...DEFAULT_VENDOR_FILTERS, openNow: true }, DEFAULT_VENDOR_SORT), true);
  assert.equal(filtersActive(DEFAULT_VENDOR_FILTERS, "rating"), true);
});

test("sorting is stable and keeps missing values last", () => {
  const rows = [
    { id: "a", average_rating: 4, review_count: 3, distKm: 3, price_range: "RM20" },
    { id: "b", average_rating: 5, review_count: 1, distKm: 1, price_range: null },
    { id: "c", average_rating: 5, review_count: 7, distKm: null, price_range: "RM10" },
  ];
  assert.deepEqual(sortVendors(rows, "rating").map((v) => v.id), ["c", "b", "a"]);
  assert.deepEqual(sortVendors(rows, "nearest").map((v) => v.id), ["b", "a", "c"]);
  assert.deepEqual(sortVendors(rows, "price-low").map((v) => v.id), ["c", "a", "b"]);
  assert.deepEqual(sortVendors(rows, "relevant").map((v) => v.id), ["a", "b", "c"]);
});
```

- [ ] **Step 2: Run the unit test and verify the new contract fails**

Run: `cd frontend && node --test src/lib/vendorFilters.test.mjs`

Expected: FAIL because the new exports and advanced behavior do not exist.

- [ ] **Step 3: Implement defaults, strict parsers, matching, Kuala Lumpur time conversion, and stable sorting**

Implement the following public contract in `frontend/src/lib/vendorFilters.js`:

```js
import { categoryMatches, creatorHandle } from "./vendorDisplay.js";

export const DEFAULT_VENDOR_FILTERS = Object.freeze({
  search: "", category: "all", creator: "all", price: "all",
  hours: "any", rating: "any", distance: "any", openNow: false,
});
export const DEFAULT_VENDOR_SORT = "relevant";

const PRICE_BUCKETS = {
  "under-10": { min: 0, max: 9.999 },
  "10-20": { min: 10, max: 20 },
  "20-40": { min: 20, max: 40 },
  "40-plus": { min: 40, max: Infinity },
};
const PERIODS = {
  breakfast: { open: 360, close: 660 },
  lunch: { open: 660, close: 900 },
  dinner: { open: 1020, close: 1320 },
  "late-night": { open: 1320, close: 120 },
};

export function parsePriceRange(value) {
  const match = String(value || "").match(/^\s*RM\s*(\d+(?:\.\d+)?)\s*(?:-\s*(?:RM\s*)?(\d+(?:\.\d+)?))?(?:\s+per person)?\s*$/i);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2] || match[1]);
  return Number.isFinite(min) && Number.isFinite(max)
    ? { min: Math.min(min, max), max: Math.max(min, max) }
    : null;
}

const HOURS_RE = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i;
function toMinutes(hour, minute, period) {
  return (Number(hour) % 12 + (/pm/i.test(period) ? 12 : 0)) * 60 + Number(minute);
}
export function parseOperatingWindow(value) {
  const match = HOURS_RE.exec(String(value || ""));
  if (!match) return null;
  return { open: toMinutes(match[1], match[2], match[3]), close: toMinutes(match[4], match[5], match[6]) };
}

function segments(range) {
  return range.close > range.open
    ? [[range.open, range.close]]
    : [[range.open, 1440], [0, range.close]];
}
function overlaps(a, b) {
  return segments(a).some(([a0, a1]) => segments(b).some(([b0, b1]) => a0 < b1 && b0 < a1));
}
function malaysiaMinutes(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}
function containsMinute(range, minute) {
  return range.close > range.open
    ? minute >= range.open && minute < range.close
    : minute >= range.open || minute < range.close;
}

export function matchesFilters(vendor, filters = {}, { now = new Date() } = {}) {
  const active = { ...DEFAULT_VENDOR_FILTERS, ...filters };
  const query = active.search.trim().toLowerCase();
  if (query && ![vendor.name, vendor.cuisine_types, vendor.signature_dishes]
    .some((field) => String(field || "").toLowerCase().includes(query))) return false;
  if (!categoryMatches(vendor, active.category)) return false;
  if (active.creator !== "all" && creatorHandle(vendor) !== active.creator) return false;

  const price = parsePriceRange(vendor.price_range);
  if (active.price !== "all") {
    const bucket = PRICE_BUCKETS[active.price];
    if (!price || !bucket || price.max < bucket.min || price.min > bucket.max) return false;
  }

  const window = parseOperatingWindow(vendor.operating_hours_raw || vendor.operating_hours);
  if (active.hours !== "any" && (!window || !PERIODS[active.hours] || !overlaps(window, PERIODS[active.hours]))) return false;
  if (active.openNow && (!window || !containsMinute(window, malaysiaMinutes(now)))) return false;

  const minimumRating = active.rating === "any" ? null : Number(active.rating);
  if (minimumRating != null && (!Number.isFinite(Number(vendor.average_rating)) || Number(vendor.average_rating) < minimumRating)) return false;
  const maximumDistance = active.distance === "any" ? null : Number(active.distance);
  if (maximumDistance != null && (!Number.isFinite(Number(vendor.distKm)) || Number(vendor.distKm) > maximumDistance)) return false;
  return true;
}

export function filtersActive(filters = {}, sort = DEFAULT_VENDOR_SORT) {
  const active = { ...DEFAULT_VENDOR_FILTERS, ...filters };
  return Object.keys(DEFAULT_VENDOR_FILTERS).some((key) => active[key] !== DEFAULT_VENDOR_FILTERS[key])
    || sort !== DEFAULT_VENDOR_SORT;
}

export function sortVendors(vendors, sort = DEFAULT_VENDOR_SORT) {
  const rows = vendors.map((vendor, index) => ({ vendor, index }));
  const knownFirst = (a, b, read, descending = false, useIndex = true) => {
    const av = read(a.vendor); const bv = read(b.vendor);
    const ak = Number.isFinite(av); const bk = Number.isFinite(bv);
    if (ak !== bk) return ak ? -1 : 1;
    if (!ak) return a.index - b.index;
    return (descending ? bv - av : av - bv) || (useIndex ? a.index - b.index : 0);
  };
  if (sort === "rating") rows.sort((a, b) =>
    knownFirst(a, b, (v) => Number(v.average_rating), true, false)
    || knownFirst(a, b, (v) => Number(v.review_count), true));
  if (sort === "nearest") rows.sort((a, b) => knownFirst(a, b, (v) => Number(v.distKm)));
  if (sort === "price-low") rows.sort((a, b) => knownFirst(a, b, (v) => parsePriceRange(v.price_range)?.min ?? NaN));
  return rows.map(({ vendor }) => vendor);
}
```

- [ ] **Step 4: Run focused and full unit tests**

Run: `cd frontend && node --test src/lib/vendorFilters.test.mjs`

Expected: all `vendorFilters` tests PASS.

Run: `cd frontend && npm run test:unit`

Expected: all unit tests PASS with zero failures.

- [ ] **Step 5: Commit the filter engine**

```bash
git add frontend/src/lib/vendorFilters.js frontend/src/lib/vendorFilters.test.mjs
git commit -m "feat: add advanced vendor filter engine"
```

---

### Task 2: Make MapPage own canonical state and one derived vendor collection

**Files:**
- Modify: `frontend/src/pages/MapPage.jsx`
- Create: `frontend/src/lib/advancedFilterWiring.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_VENDOR_FILTERS`, `DEFAULT_VENDOR_SORT`, `matchesFilters`, and `sortVendors` from Task 1; `haversineKm(originLat, originLng, vendorLat, vendorLng)` from `mapVisibility.js`.
- Produces: controlled props for Dashboard and VendorPanel: `filters`, `sort`, `onFilters(partial)`, `onSort(sort)`, `onClearFilters()`, `hasLocation`, and a shared `filteredVendors` array.

- [ ] **Step 1: Write failing wiring-contract tests**

Create `frontend/src/lib/advancedFilterWiring.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mapPage = readFileSync(new URL("../pages/MapPage.jsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/Dashboard.jsx", import.meta.url), "utf8");
const vendorPanel = readFileSync(new URL("../components/VendorPanel.jsx", import.meta.url), "utf8");

test("MapPage owns complete canonical filters and sort", () => {
  assert.match(mapPage, /useState\(DEFAULT_VENDOR_FILTERS\)/);
  assert.match(mapPage, /useState\(DEFAULT_VENDOR_SORT\)/);
  assert.match(mapPage, /onClearFilters/);
});

test("MapPage derives one filtered collection and passes it to both views", () => {
  assert.match(mapPage, /const filteredVendors = useMemo/);
  assert.match(mapPage, /<Dashboard[\s\S]*filteredVendors=\{filteredVendors\}/);
  assert.match(mapPage, /<VendorPanel[\s\S]*filteredVendors=\{filteredVendors\}/);
});

test("distance decoration only happens with a user origin", () => {
  assert.match(mapPage, /userPos\s*\?/);
  assert.match(mapPage, /haversineKm\(userPos\.lat, userPos\.lng/);
  assert.match(mapPage, /hasLocation=\{userPos != null\}/);
});

test("child views consume controlled filter props", () => {
  assert.match(dashboard, /filters, sort, onFilters, onSort, onClearFilters/);
  assert.match(vendorPanel, /filters, sort, onFilters, onSort, onClearFilters/);
});
```

- [ ] **Step 2: Run the wiring test and verify failure**

Run: `cd frontend && node --test src/lib/advancedFilterWiring.test.mjs`

Expected: FAIL because MapPage still owns only three filters and Dashboard owns separate local state.

- [ ] **Step 3: Add canonical state and location-aware derivation to MapPage**

Update imports and state in `frontend/src/pages/MapPage.jsx`:

```jsx
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VENDOR_FILTERS,
  DEFAULT_VENDOR_SORT,
  matchesFilters,
  sortVendors,
} from "../lib/vendorFilters";

const [filters, setFilters] = useState(DEFAULT_VENDOR_FILTERS);
const [sort, setSort] = useState(DEFAULT_VENDOR_SORT);
const updateFilters = (partial) => setFilters((current) => ({ ...current, ...partial }));
const clearFilters = () => {
  setFilters(DEFAULT_VENDOR_FILTERS);
  setSort(DEFAULT_VENDOR_SORT);
};

const vendorsWithDistance = useMemo(() => userPos
  ? vendors.map((vendor) => vendor.latitude == null || vendor.longitude == null
    ? { ...vendor, distKm: undefined }
    : { ...vendor, distKm: haversineKm(userPos.lat, userPos.lng, vendor.latitude, vendor.longitude) })
  : vendors.map((vendor) => ({ ...vendor, distKm: undefined })),
[vendors, userPos]);

const filteredVendors = useMemo(
  () => sortVendors(vendorsWithDistance.filter((vendor) => matchesFilters(vendor, filters)), sort),
  [vendorsWithDistance, filters, sort],
);
```

Create one object for the new controlled contract, then spread it into both existing component calls alongside their current bookmark, trip, navigation, and error props. Use `vendorsWithDistance` for complete-option inventories and `filteredVendors` for displayed results:

```jsx
const sharedDiscoveryProps = {
  vendors: vendorsWithDistance,
  filteredVendors,
  filters,
  sort,
  onFilters: updateFilters,
  onSort: setSort,
  onClearFilters: clearFilters,
  hasLocation: userPos != null,
};

<Dashboard {...sharedDiscoveryProps} />
<VendorPanel {...sharedDiscoveryProps} />
```

The snippet names every new value that must be shared, while the existing component-specific props stay on their current call sites.

Build pins from `filteredVendors`, re-adding trip stops from `vendorsWithDistance` so active routes never lose markers. Build `nearbyToAdd` from `filteredVendors`, then apply trip exclusion and the existing radius limit. Do not call `matchesFilters` again in those pipelines.

- [ ] **Step 4: Run wiring and unit tests**

Run: `cd frontend && node --test src/lib/advancedFilterWiring.test.mjs`

Expected: PASS.

Run: `cd frontend && npm run test:unit`

Expected: all unit tests PASS.

- [ ] **Step 5: Commit canonical state wiring**

```bash
git add frontend/src/pages/MapPage.jsx frontend/src/lib/advancedFilterWiring.test.mjs
git commit -m "refactor: share discovery filter state"
```

---

### Task 3: Build the reusable responsive AdvancedFilters component

**Files:**
- Create: `frontend/src/components/discovery/AdvancedFilters.jsx`
- Modify: `frontend/src/lib/advancedFilterWiring.test.mjs`

**Interfaces:**
- Consumes props: `{ filters, sort, onChange, onSortChange, onClear, vendors, resultCount, hasLocation, compact?: boolean }`.
- Produces semantic controls with test IDs: `advanced-filters`, `filters-toggle`, `filters-region`, `filter-category`, `filter-creator`, `filter-price`, `filter-hours`, `filter-rating`, `filter-distance`, `filter-open-now`, `filter-sort`, and `clear-filters`.

- [ ] **Step 1: Add failing source-contract tests for the reusable component**

Append to `frontend/src/lib/advancedFilterWiring.test.mjs`:

```js
const advancedFilters = readFileSync(new URL("../components/discovery/AdvancedFilters.jsx", import.meta.url), "utf8");

test("AdvancedFilters exposes every approved control and responsive region semantics", () => {
  for (const testId of [
    "advanced-filters", "filters-toggle", "filters-region", "filter-category",
    "filter-creator", "filter-price", "filter-hours", "filter-rating",
    "filter-distance", "filter-open-now", "filter-sort", "clear-filters",
  ]) assert.match(advancedFilters, new RegExp(`data-testid=["']${testId}["']`));
  assert.match(advancedFilters, /aria-expanded/);
  assert.match(advancedFilters, /role=["']switch["']/);
});

test("location-dependent controls explain and enforce unavailability", () => {
  assert.match(advancedFilters, /hasLocation/);
  assert.match(advancedFilters, /Set your location/);
  assert.match(advancedFilters, /disabled=\{!hasLocation\}/);
});
```

- [ ] **Step 2: Run the source test and verify failure**

Run: `cd frontend && node --test src/lib/advancedFilterWiring.test.mjs`

Expected: FAIL because `AdvancedFilters.jsx` does not exist.

- [ ] **Step 3: Implement the responsive panel with real controls**

Create `frontend/src/components/discovery/AdvancedFilters.jsx` using Lucide icons (`ChevronDown`, `ChevronUp`, `Clock3`, `MapPin`, `RotateCcw`, `Star`, `Tags`, `Users`, `WalletCards`) and the existing category constants/creator helper.

Use this public structure and behavior:

```jsx
export default function AdvancedFilters({
  filters, sort, onChange, onSortChange, onClear, vendors = [],
  resultCount = 0, hasLocation = false, compact = false,
}) {
  const [expanded, setExpanded] = useState(() => typeof window !== "undefined"
    && window.matchMedia("(min-width: 768px)").matches);
  const regionId = useId();
  const active = filtersActive(filters, sort);
  const creators = creatorOptions(vendors);

  useEffect(() => {
    if (!hasLocation && filters.distance !== "any") onChange({ distance: "any" });
    if (!hasLocation && sort === "nearest") onSortChange(DEFAULT_VENDOR_SORT);
  }, [hasLocation, filters.distance, sort, onChange, onSortChange]);

  return (
    <section
      data-testid="advanced-filters"
      className={compact
        ? "rounded-lg border border-sand bg-white p-3"
        : "rounded border border-sand bg-white p-4 md:p-5"}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterSelect data-testid="filter-creator" label="Recommended by" value={filters.creator}
          onChange={(value) => onChange({ creator: value })} options={creators} />
        <div className="flex items-center gap-2">
          <button data-testid="clear-filters" type="button" disabled={!active} onClick={onClear}>Clear all</button>
          <button data-testid="filters-toggle" type="button" aria-expanded={expanded}
            aria-controls={regionId} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Hide filters" : "Show filters"}
          </button>
        </div>
      </div>

      <div id={regionId} data-testid="filters-region" hidden={!expanded}>
        {/* Category, price, hours, rating, and distance labelled selects */}
        <button data-testid="filter-open-now" type="button" role="switch"
          aria-checked={filters.openNow} onClick={() => onChange({ openNow: !filters.openNow })}>
          <span>Open now</span>
          <span
            aria-hidden="true"
            className={filters.openNow
              ? "relative h-6 w-11 rounded-full bg-forest after:absolute after:right-1 after:top-1 after:size-4 after:rounded-full after:bg-white"
              : "relative h-6 w-11 rounded-full bg-sand after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white"}
          />
        </button>
        {!hasLocation && <p className="text-xs text-muted">Set your location to filter or sort by distance.</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand pt-4">
        <p>{resultCount} places found</p>
        <FilterSelect data-testid="filter-sort" label="Sort by" value={sort}
          onChange={onSortChange} disabledOption={!hasLocation ? "nearest" : null} options={SORT_OPTIONS} />
      </div>
    </section>
  );
}
```

Use `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5` for the full control grid and `grid grid-cols-1 gap-3` for compact mode. Inputs use `min-h-11 w-full rounded border border-sand bg-white px-3 text-sm text-ink outline-none focus:border-forest`. Build category options from `CATEGORY_FILTERS` plus available `MORE_CATEGORY_OPTIONS`; build creator options from `creatorHandle` counts.

- [ ] **Step 4: Run focused tests and build**

Run: `cd frontend && node --test src/lib/advancedFilterWiring.test.mjs`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: Vite build succeeds; the existing large-chunk warning is acceptable.

- [ ] **Step 5: Commit the reusable UI**

```bash
git add frontend/src/components/discovery/AdvancedFilters.jsx frontend/src/lib/advancedFilterWiring.test.mjs
git commit -m "feat: add responsive advanced filters panel"
```

---

### Task 4: Integrate the full panel, compact sidebar, pagination, pins, and empty states

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx`
- Modify: `frontend/src/components/VendorPanel.jsx`
- Modify: `frontend/src/pages/MapPage.jsx`
- Modify: `frontend/src/lib/advancedFilterWiring.test.mjs`

**Interfaces:**
- Consumes: Task 2's controlled props and Task 3's `AdvancedFilters` component.
- Produces: one interactive filter panel in List, one compact panel in Map sidebar, synchronized result count, stable pagination, pins, and empty-state reset.

- [ ] **Step 1: Add failing integration-contract assertions**

Append:

```js
test("Dashboard renders controlled advanced filters and paginates the shared result", () => {
  assert.match(dashboard, /<AdvancedFilters/);
  assert.match(dashboard, /resultCount=\{filteredVendors\.length\}/);
  assert.match(dashboard, /paginate\(filteredVendors, page, PAGE_SIZE\)/);
  assert.match(dashboard, /onClear=\{onClearFilters\}/);
});

test("VendorPanel replaces duplicate chips with compact shared controls", () => {
  assert.match(vendorPanel, /<AdvancedFilters/);
  assert.match(vendorPanel, /compact/);
  assert.doesNotMatch(vendorPanel, /<FilterChips/);
});

test("Map pins and nearby results originate from the shared filtered collection", () => {
  assert.match(mapPage, /filteredVendors/);
  assert.doesNotMatch(mapPage, /\.filter\(\(v\) => matchesFilters\(v, filters\)\)/);
});
```

- [ ] **Step 2: Run the integration contract and verify failure**

Run: `cd frontend && node --test src/lib/advancedFilterWiring.test.mjs`

Expected: FAIL until Dashboard and VendorPanel render `AdvancedFilters` and MapPage stops re-filtering.

- [ ] **Step 3: Convert Dashboard to controlled results**

In `Dashboard.jsx`:

- Remove local `search`, `category`, and `creator` state.
- Accept `filteredVendors`, `filters`, `sort`, `onFilters`, `onSort`, `onClearFilters`, and `hasLocation` props.
- Keep the existing full-width search input but bind it to `filters.search` and `onFilters({ search })`.
- Render `AdvancedFilters` beneath search with all vendors for option inventory and `filteredVendors.length` for result count.
- Change pagination to `paginate(filteredVendors, page, PAGE_SIZE)`.
- Reset page 1 when `filters` or `sort` changes.
- Change Empty copy to `Try changing or clearing your filters.` and its button to `onClearFilters`.

Core rendering shape:

```jsx
<input
  value={filters.search}
  onChange={(event) => onFilters({ search: event.target.value })}
  aria-label="Search places"
/>
<AdvancedFilters
  filters={filters}
  sort={sort}
  onChange={onFilters}
  onSortChange={onSort}
  onClear={onClearFilters}
  vendors={vendors}
  resultCount={filteredVendors.length}
  hasLocation={hasLocation}
/>
```

- [ ] **Step 4: Convert VendorPanel to compact controlled results**

In `VendorPanel.jsx`, remove the separate Search, FilterChips, Clear filters button, and `filtersActive` import. Render:

```jsx
<AdvancedFilters
  compact
  filters={filters}
  sort={sort}
  onChange={onFilters}
  onSortChange={onSort}
  onClear={onClearFilters}
  vendors={vendors}
  resultCount={filteredVendors.length}
  hasLocation={hasLocation}
/>
```

Keep the existing Nearby to Add radius buttons and map-visibility toggle below the compact panel. These are map presentation/trip controls, not discovery filters.

- [ ] **Step 5: Finish MapPage's shared pin and sidebar pipelines**

Construct a `filteredIds` set. Preserve trip-stop markers while using only shared matches for other pins:

```jsx
const filteredIds = new Set(filteredVendors.map((vendor) => vendor.id));
const pinVendors = vendorsWithDistance.filter((vendor) => stopIds.has(vendor.id) || filteredIds.has(vendor.id));
const nearbyToAdd = anchor
  ? filteredVendors
    .filter((vendor) => vendor.latitude != null && vendor.longitude != null && !stopIds.has(vendor.id))
    .filter((vendor) => Number(vendor.distKm) <= effectiveRadiusKm)
    .slice(0, 12)
    .map((vendor) => ({ ...vendor, distKm: Number(vendor.distKm.toFixed(2)) }))
  : [];
```

Pass the complete controlled props to VendorPanel. Ensure List-to-Map and Map-to-List navigation changes only `view` search params and does not reset `filters` or `sort`.

- [ ] **Step 6: Run focused tests, full unit tests, and build**

Run: `cd frontend && node --test src/lib/advancedFilterWiring.test.mjs`

Expected: PASS.

Run: `cd frontend && npm run test:unit`

Expected: all unit tests PASS.

Run: `cd frontend && npm run build`

Expected: build succeeds.

- [ ] **Step 7: Commit the integrated experience**

```bash
git add frontend/src/components/Dashboard.jsx frontend/src/components/VendorPanel.jsx frontend/src/pages/MapPage.jsx frontend/src/lib/advancedFilterWiring.test.mjs
git commit -m "feat: synchronize advanced discovery filters"
```

---

### Task 5: Verify responsive behavior, browser interactions, and design fidelity

**Files:**
- Create: `frontend/tests/responsive/discovery-advanced-filters.spec.js`
- Create or modify: `design-qa.md`

**Interfaces:**
- Consumes: the complete UI and data flow from Tasks 1-4.
- Produces: automated responsive regression coverage and a visual QA record that names artifacts by basename only.

- [ ] **Step 1: Write failing responsive tests**

Create `frontend/tests/responsive/discovery-advanced-filters.spec.js` using the existing fixture routing helpers/patterns from `frontend/tests/responsive/routes.spec.js`:

```js
import { test, expect } from "@playwright/test";

test("desktop discovery filters start open and update the result set", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map");
  await expect(page.getByTestId("filters-region")).toBeVisible();
  await page.getByTestId("filter-rating").selectOption("4.5");
  await expect(page.getByTestId("advanced-filters")).toContainText(/places found/);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("mobile filters start closed and expand without viewport overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/map");
  await expect(page.getByTestId("filters-region")).toBeHidden();
  await page.getByTestId("filters-toggle").click();
  await expect(page.getByTestId("filters-region")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("filters persist when switching between list and map", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map");
  await page.getByTestId("filter-price").selectOption("10-20");
  await page.getByRole("button", { name: "Map" }).click();
  await page.getByRole("tab", { name: "Vendors" }).click();
  await expect(page.getByTestId("filter-price")).toHaveValue("10-20");
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByTestId("filter-price")).toHaveValue("10-20");
});

test("distance controls are unavailable before a location exists", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map");
  await expect(page.getByTestId("filter-distance")).toBeDisabled();
  await expect(page.getByTestId("advanced-filters")).toContainText("Set your location");
});
```

The locators intentionally match the existing DiscoveryHeader `Map`/`List` buttons and MapPanel `Vendors` tab; do not add test-only production controls.

- [ ] **Step 2: Run the new responsive file and verify its initial result**

Run: `cd frontend && npx playwright test tests/responsive/discovery-advanced-filters.spec.js`

Expected before any final selectors/layout fixes: at least one assertion fails if the new UI does not yet satisfy the approved responsive contract.

- [ ] **Step 3: Fix only observed responsive or accessibility failures**

Use existing TrueBites tokens and Lucide icons. Do not add fake assets, inline SVGs, or unrelated redesign. Ensure controls are full width on mobile, the desktop grid matches the reference hierarchy, and `hidden` content is removed from the accessibility tree.

- [ ] **Step 4: Perform visual QA in the user's in-app browser**

Open `/map` at the reference desktop width and capture the filter panel in the in-app browser. Compare it side-by-side with the provided reference screenshot at the same effective viewport, checking border color, control height, padding, label weight, grid alignment, open-now toggle, result row, and sort placement. Then inspect 375-pixel mobile stacking and interaction. Record `reference basename`, `desktop capture basename`, `mobile capture basename`, findings, fixes, and `final result: passed` in `design-qa.md`. Do not record `/var/`, `/Users/`, signed URLs, or other machine-local paths.

- [ ] **Step 5: Run complete verification**

Run: `cd frontend && npm run test:unit`

Expected: all unit tests PASS.

Run: `cd frontend && npm run test:responsive`

Expected: all responsive tests PASS.

Run: `cd frontend && npm run build`

Expected: build succeeds; the known chunk-size warning may remain.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended files are modified before the final commit.

- [ ] **Step 6: Commit responsive coverage and QA evidence**

```bash
git add frontend/tests/responsive/discovery-advanced-filters.spec.js
git add -f design-qa.md
git commit -m "test: verify advanced discovery filters"
```

---

### Task 6: Final review and branch handoff

**Files:**
- Review all files changed since commit `20f04d3`.

**Interfaces:**
- Consumes: all implementation commits from Tasks 1-5.
- Produces: evidence that the implementation matches the design, exposes no local paths or sensitive data, and is ready for the user's chosen integration action.

- [ ] **Step 1: Review the branch diff**

Run:

```bash
git diff --stat 20f04d3..HEAD
git diff --check 20f04d3..HEAD
git diff 20f04d3..HEAD -- frontend/src/lib/vendorFilters.js frontend/src/pages/MapPage.jsx frontend/src/components/Dashboard.jsx frontend/src/components/VendorPanel.jsx frontend/src/components/discovery/AdvancedFilters.jsx
```

Expected: only approved filtering, synchronization, testing, and QA changes; no unrelated refactors.

- [ ] **Step 2: Audit paths and privacy**

Run: `rg -n '/var/|/Users/|signedUrl|service_role|SUPABASE_SERVICE' design-qa.md frontend/src frontend/tests/responsive/discovery-advanced-filters.spec.js || true`

Expected: no machine-local path or secret exposure in committed artifacts.

- [ ] **Step 3: Re-run the final verification suite after review fixes**

Run:

```bash
cd frontend
npm run test:unit
npm run test:responsive
npm run build
```

Expected: all unit and responsive tests pass, and build succeeds.

- [ ] **Step 4: Confirm clean handoff state**

Run: `git status --short --branch`

Expected: clean `fix/user-navigation` worktree with implementation commits ahead of `main`; do not push or merge without the user's explicit choice.
