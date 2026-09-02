import { useId, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Clock3,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Tags,
  Users,
  WalletCards,
} from "lucide-react";
import {
  CATEGORY_FILTERS,
  MORE_CATEGORY_OPTIONS,
  categoryMatches,
  creatorHandle,
} from "../../lib/vendorDisplay";
import {
  DEFAULT_VENDOR_SORT,
  filtersActive,
} from "../../lib/vendorFilters";

const PRICE_OPTIONS = [
  { value: "all", label: "Any price" },
  { value: "under-10", label: "Under RM10" },
  { value: "10-20", label: "RM10 – RM20" },
  { value: "20-40", label: "RM20 – RM40" },
  { value: "40-plus", label: "RM40+" },
];

const HOURS_OPTIONS = [
  { value: "any", label: "Anytime" },
  { value: "breakfast", label: "Breakfast · 6–11am" },
  { value: "lunch", label: "Lunch · 11am–3pm" },
  { value: "dinner", label: "Dinner · 5–10pm" },
  { value: "late-night", label: "Late night · 10pm–2am" },
];

const RATING_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "3", label: "3.0+" },
  { value: "4", label: "4.0+" },
  { value: "4.5", label: "4.5+" },
];

const DISTANCE_OPTIONS = [
  { value: "any", label: "Any distance" },
  { value: "1", label: "Within 1 km" },
  { value: "2", label: "Within 2 km" },
  { value: "5", label: "Within 5 km" },
  { value: "10", label: "Within 10 km" },
];

const SORT_OPTIONS = [
  { value: "relevant", label: "Most relevant" },
  { value: "rating", label: "Highest rated" },
  { value: "nearest", label: "Nearest" },
  { value: "price-low", label: "Price: low to high" },
];

const CONTROL = "min-h-11 w-full appearance-none rounded border border-sand bg-white px-3 pr-9 text-sm text-ink outline-none transition-colors focus:border-forest focus:shadow-[0_0_0_3px_rgba(64,84,74,0.1)] disabled:cursor-not-allowed disabled:bg-chalk disabled:text-muted/60";

function countFor(vendors, key) {
  return vendors.filter((vendor) => categoryMatches(vendor, key)).length;
}

function categoryOptions(vendors) {
  const more = MORE_CATEGORY_OPTIONS.filter((option) => countFor(vendors, option.key) > 0);
  return [...CATEGORY_FILTERS, ...more].map((option) => ({
    value: option.key,
    label: option.key === "all" ? "All categories" : `${option.label} (${countFor(vendors, option.key)})`,
  }));
}

function creatorOptions(vendors) {
  const counts = new Map();
  vendors.forEach((vendor) => {
    const creator = creatorHandle(vendor);
    if (creator) counts.set(creator, (counts.get(creator) || 0) + 1);
  });
  return [
    { value: "all", label: "All creators" },
    ...[...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, label: `${value} (${count})` })),
  ];
}

function FilterSelect({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  disabled = false,
  disabledOption = null,
  "data-testid": testId,
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
        {Icon && <Icon size={16} strokeWidth={1.8} className="text-muted" aria-hidden="true" />}
        {label}
      </span>
      <span className="relative block">
        <select
          data-testid={testId}
          className={CONTROL}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.value === disabledOption}
            >
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

export default function AdvancedFilters({
  filters,
  sort,
  onChange,
  onSortChange,
  onClear,
  vendors = [],
  resultCount = 0,
  hasLocation = false,
  compact = false,
}) {
  const [expanded, setExpanded] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  ));
  const regionId = useId();
  const active = filtersActive(filters, sort);

  return (
    <section
      data-testid="advanced-filters"
      className={compact
        ? "rounded-lg border border-sand bg-chalk/45 p-3"
        : "rounded border border-sand bg-white p-4 shadow-[0_1px_0_rgba(64,84,74,0.03)] md:p-5"}
    >
      <div className={compact
        ? "flex flex-col gap-3"
        : "flex flex-col gap-4 md:flex-row md:items-end md:justify-between"}
      >
        <div className={compact ? "w-full" : "w-full md:max-w-[300px]"}>
          <FilterSelect
            data-testid="filter-creator"
            label="Recommended by"
            icon={Users}
            options={creatorOptions(vendors)}
            value={filters.creator}
            onChange={(creator) => onChange({ creator })}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            data-testid="clear-filters"
            type="button"
            disabled={!active}
            onClick={onClear}
            className="inline-flex min-h-11 items-center gap-2 rounded px-3 text-[13px] font-semibold text-muted transition-colors hover:bg-chalk hover:text-forest disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
            Clear all
          </button>
          <button
            data-testid="filters-toggle"
            type="button"
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex min-h-11 items-center gap-2 rounded px-3 text-[13px] font-semibold text-forest transition-colors hover:bg-chalk"
          >
            <SlidersHorizontal size={15} strokeWidth={1.8} aria-hidden="true" />
            {expanded ? "Hide filters" : "Show filters"}
            {expanded
              ? <ChevronUp size={15} strokeWidth={1.8} aria-hidden="true" />
              : <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id={regionId}
        data-testid="filters-region"
        hidden={!expanded}
        className={compact
          ? "mt-4 grid grid-cols-1 gap-3 border-t border-sand pt-4"
          : "mt-5 grid grid-cols-1 gap-4 border-t border-sand pt-5 md:grid-cols-2 xl:grid-cols-5"}
      >
        <FilterSelect
          data-testid="filter-category"
          label="Category"
          icon={Tags}
          options={categoryOptions(vendors)}
          value={filters.category}
          onChange={(category) => onChange({ category })}
        />
        <FilterSelect
          data-testid="filter-price"
          label="Price range"
          icon={WalletCards}
          options={PRICE_OPTIONS}
          value={filters.price}
          onChange={(price) => onChange({ price })}
        />
        <FilterSelect
          data-testid="filter-hours"
          label="Operating hours"
          icon={Clock3}
          options={HOURS_OPTIONS}
          value={filters.hours}
          onChange={(hours) => onChange({ hours })}
        />
        <FilterSelect
          data-testid="filter-rating"
          label="Rating"
          icon={Star}
          options={RATING_OPTIONS}
          value={filters.rating}
          onChange={(rating) => onChange({ rating })}
        />
        <FilterSelect
          data-testid="filter-distance"
          label="Distance"
          icon={MapPin}
          options={DISTANCE_OPTIONS}
          value={hasLocation ? filters.distance : "any"}
          disabled={!hasLocation}
          onChange={(distance) => onChange({ distance })}
        />

        <div className={compact ? "" : "xl:col-start-5"}>
          <span className="mb-2 block text-[13px] font-semibold text-ink">Availability</span>
          <button
            data-testid="filter-open-now"
            type="button"
            role="switch"
            aria-checked={filters.openNow}
            onClick={() => onChange({ openNow: !filters.openNow })}
            className="flex min-h-11 w-full items-center justify-between rounded border border-sand bg-white px-3 text-sm font-medium text-ink transition-colors hover:border-forest"
          >
            <span>Open now</span>
            <span
              aria-hidden="true"
              className={filters.openNow
                ? "flex h-6 w-11 items-center justify-end rounded-full bg-forest px-1 text-white"
                : "flex h-6 w-11 items-center justify-start rounded-full bg-sand px-1 text-white"}
            >
              <Circle size={16} fill="currentColor" strokeWidth={0} />
            </span>
          </button>
        </div>

        {!hasLocation && (
          <p className={compact
            ? "m-0 text-xs leading-5 text-muted"
            : "m-0 text-xs leading-5 text-muted md:col-span-2 xl:col-span-5"}
          >
            Set your location to filter or sort by distance.
          </p>
        )}
      </div>

      <div className={compact
        ? "mt-4 flex flex-col gap-3 border-t border-sand pt-4"
        : "mt-5 flex flex-col gap-3 border-t border-sand pt-4 sm:flex-row sm:items-end sm:justify-between"}
      >
        <p className="m-0 min-h-11 content-center text-[13px] text-muted" aria-live="polite">
          <strong className="font-semibold text-forest">{resultCount}</strong> places found
        </p>
        <div className={compact ? "w-full" : "w-full sm:max-w-[260px]"}>
          <FilterSelect
            data-testid="filter-sort"
            label="Sort by"
            options={SORT_OPTIONS}
            value={!hasLocation && sort === "nearest" ? DEFAULT_VENDOR_SORT : sort}
            disabledOption={!hasLocation ? "nearest" : null}
            onChange={onSortChange}
          />
        </div>
      </div>
    </section>
  );
}
