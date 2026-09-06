import { useId, useState } from "react";
import {
  ChevronDown,
  Circle,
  Clock3,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  Tags,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Toast from "../engagement/Toast";
import {
  CATEGORY_FILTERS,
  MORE_CATEGORY_OPTIONS,
  categoryMatches,
  creatorHandle,
} from "../../lib/vendorDisplay";
import { DEFAULT_VENDOR_FILTERS, filtersActive } from "../../lib/vendorFilters";

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

const CONTROL = "min-h-11 w-full appearance-none rounded-full border border-sand bg-white px-4 pr-9 text-sm text-ink outline-none transition-colors focus:border-forest focus:shadow-[0_0_0_3px_rgba(64,84,74,0.1)] disabled:cursor-not-allowed disabled:bg-chalk disabled:text-muted/60";

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

function FilterSelect({ label, icon: Icon, options, value, onChange, "data-testid": testId }) {
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
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
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
  onChange,
  onClear,
  vendors = [],
  compact = false,
}) {
  // Collapsed on every width now — the row carries search and creator, and the
  // toggle's badge says whether anything is hidden behind it.
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const active = filtersActive(filters);
  // Only the four controls behind the toggle. Search and creator live in the
  // visible row, so counting them would label the badge for filters the user
  // can already see.
  const activeCount = ["category", "price", "hours", "rating"]
    .filter((key) => filters[key] !== DEFAULT_VENDOR_FILTERS[key]).length
    + (filters.openNow ? 1 : 0);

  return (
    <section
      data-testid="advanced-filters"
      className={compact
        ? "filter-glass rounded-lg p-3"
        : "filter-glass rounded p-4 md:p-5"}
    >
      <div className={compact
        ? "flex flex-col gap-2.5"
        : "flex flex-col gap-2.5 sm:flex-row sm:items-center"}
      >
        <label data-testid="discovery-search" className="relative flex min-w-0 flex-1 items-center">
          <Search size={17} strokeWidth={1.8} className="pointer-events-none absolute left-3 text-muted" />
          <input
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search Nasi Lemak, Jonker, Kopitiam…"
            aria-label="Search places"
            className="min-h-11 w-full rounded-md border border-sand bg-white pl-10 pr-3 text-sm text-ink outline-none placeholder:text-[#8B9197] focus:border-forest focus:shadow-[0_0_0_3px_rgba(64,84,74,0.1)]"
          />
        </label>

        <div className="flex items-center gap-2.5">
          <span className={compact
            ? "relative flex min-w-0 flex-1 items-center"
            : "relative flex min-w-0 flex-1 items-center sm:flex-none"}
          >
            <Users size={16} strokeWidth={1.8} className="pointer-events-none absolute left-3 text-muted" aria-hidden="true" />
            <select
              data-testid="filter-creator"
              className={compact
                ? "min-h-11 w-full appearance-none rounded-md border border-sand bg-white pl-9 pr-9 text-sm text-ink outline-none focus:border-forest"
                : "min-h-11 w-full appearance-none rounded-md border border-sand bg-white pl-9 pr-9 text-sm text-ink outline-none focus:border-forest sm:w-auto sm:min-w-[190px]"}
              value={filters.creator}
              onChange={(event) => onChange({ creator: event.target.value })}
              aria-label="Recommended by"
            >
              {creatorOptions(vendors).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown size={16} strokeWidth={1.8} className="pointer-events-none absolute right-3 text-muted" aria-hidden="true" />
          </span>

          <button
            data-testid="filters-toggle"
            type="button"
            aria-expanded={expanded}
            aria-controls={regionId}
            aria-label="Filters"
            onClick={() => setExpanded((current) => !current)}
            className={expanded
              ? "relative grid size-11 shrink-0 place-items-center rounded-md border border-forest bg-forest text-white"
              : "relative grid size-11 shrink-0 place-items-center rounded-md border border-sand bg-white text-forest transition-colors hover:border-forest motion-reduce:transition-none"}
          >
            <SlidersHorizontal size={18} strokeWidth={1.8} aria-hidden="true" />
            {activeCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid min-w-[17px] place-items-center rounded-full bg-terracotta px-1 text-[10.5px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div
        id={regionId}
        data-testid="filters-region"
        hidden={!expanded}
        className={compact
          ? "mt-4 border-t border-sand pt-4"
          : "mt-5 border-t border-sand pt-5"}
      >
        <div className={compact
          ? "grid grid-cols-1 gap-3"
          : "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5"}
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
          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink">Availability</span>
            <button
            data-testid="filter-open-now"
            type="button"
            role="switch"
            aria-checked={filters.openNow}
            onClick={() => onChange({ openNow: !filters.openNow })}
            className="flex min-h-11 w-full items-center justify-between rounded-full border border-sand bg-white px-4 text-sm font-medium text-ink transition-colors hover:border-forest"
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
        </div>

        {/* Outside the grid on purpose: it should align with the panel edge, not a grid cell. */}
        <div className="mt-4 flex items-center justify-end">
          <button
            data-testid="clear-filters"
            type="button"
            disabled={!active}
            onClick={onClear}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-[13px] font-semibold text-muted transition-colors hover:bg-chalk hover:text-forest disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
            Clear all
          </button>
        </div>
      </div>
    </section>
  );
}
