import { useId, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Clock3,
  MapPin,
  Navigation,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Tags,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Toast from "../engagement/Toast";
import { useToast } from "../../lib/useToast";
import {
  CATEGORY_FILTERS,
  MORE_CATEGORY_OPTIONS,
  categoryMatches,
  creatorHandle,
} from "../../lib/vendorDisplay";
import {
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

function FilterSelect({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  disabled = false,
  onDisabledClick,
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
            <option key={option.value} value={option.value}>
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
        {/* A disabled <select> swallows its own click events, so an overlay
            button is the only way to explain why the control is dead. */}
        {disabled && onDisabledClick && (
          <button
            type="button"
            data-testid={testId ? `${testId}-locked` : undefined}
            onClick={(event) => { event.preventDefault(); onDisabledClick(); }}
            aria-label={`${label} filter is disabled — enable your location`}
            className="absolute inset-0 z-10 cursor-pointer rounded-full"
          />
        )}
      </span>
    </label>
  );
}

export default function AdvancedFilters({
  filters,
  onChange,
  onClear,
  vendors = [],
  resultCount = 0,
  hasLocation = false,
  onRequestLocation,
  compact = false,
}) {
  const [expanded, setExpanded] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  ));
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [toast, notify] = useToast();
  const regionId = useId();
  const active = filtersActive(filters);

  function promptForLocation() {
    notify("We don't know where you are! Kindly enable your location for given pop-up");
    setLocationPromptOpen(true);
  }

  function enableLocation() {
    setLocationPromptOpen(false);
    onRequestLocation?.();
  }

  return (
    <section
      data-testid="advanced-filters"
      className={compact
        ? "filter-glass rounded-lg p-3"
        : "filter-glass rounded p-4 md:p-5"}
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
          onDisabledClick={promptForLocation}
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

        {!hasLocation && (
          <p className={compact
            ? "m-0 text-xs leading-5 text-muted"
            : "m-0 text-xs leading-5 text-muted md:col-span-2 xl:col-span-5"}
          >
            Set your location to filter by distance.
          </p>
        )}
      </div>

      <p
        className={compact
          ? "mb-0 mt-4 border-t border-sand pt-4 text-[13px] text-muted"
          : "mb-0 mt-5 border-t border-sand pt-4 text-[13px] text-muted"}
        aria-live="polite"
      >
        <strong className="font-semibold text-forest">{resultCount}</strong> places found
      </p>

      {locationPromptOpen && (
        <div
          onClick={() => setLocationPromptOpen(false)}
          className="fixed inset-0 z-[1100] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[340px] rounded-t-2xl bg-white p-4 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:rounded-2xl"
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="m-0 flex items-center gap-2 font-display text-[17px] text-forest">
                <Navigation size={17} strokeWidth={1.8} aria-hidden="true" />
                Enable location
              </h3>
              <button
                type="button"
                onClick={() => setLocationPromptOpen(false)}
                aria-label="Close"
                className="grid size-11 place-items-center text-muted"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-[13px] leading-5 text-muted">
              Distance filtering needs to know where you are. Allow location access in the
              browser prompt to sort and filter places by how close they are to you.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLocationPromptOpen(false)}
                className="min-h-11 flex-1 rounded-lg border border-sand text-[13.5px] font-semibold text-muted"
              >
                Not now
              </button>
              <button
                type="button"
                data-testid="enable-location"
                onClick={enableLocation}
                className="min-h-11 flex-1 rounded-lg bg-forest text-[13.5px] font-semibold text-white"
              >
                Enable location
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </section>
  );
}
