import { Plus, Eye, EyeOff, Search, X } from "lucide-react";
import FilterChips from "./discovery/FilterChips";
import { filtersActive } from "../lib/vendorFilters";
import { placeholderImage, priceLabel, distanceLabel } from "../lib/vendorDisplay";

const RADII = [1, 2, 5, "all"];

// The Vendors tab. Browsing lives here so the Trip tab stays a route editor.
// The filters are owned by MapPage rather than this component because the same
// predicate decides which pins the map draws — see the pin rule in MapPage.
export default function VendorPanel({
  vendors, nearby,
  filters, onFilters,
  radiusKm, onRadiusChange,
  showAllVendors, onToggleAllVendors,
  onAddStop, onSelectNearby,
  hasAnchor, tripIds,
}) {
  const active = filtersActive(filters);

  return (
    <>
      <label className="relative mb-2.5 flex items-center">
        <Search size={15} strokeWidth={1.8} className="absolute left-2.5 text-muted" />
        <input
          value={filters.search}
          onChange={(e) => onFilters({ search: e.target.value })}
          placeholder="Search Nasi Lemak, Jonker…"
          aria-label="Search vendors"
          className="min-h-11 w-full rounded-lg border border-sand bg-white pl-8 pr-2.5 text-[12.5px] text-ink outline-none focus:border-forest"
        />
      </label>

      <FilterChips
        compact
        active={filters.category}
        onSelect={(category) => onFilters({ category })}
        creator={filters.creator}
        onCreatorSelect={(creator) => onFilters({ creator })}
        vendors={vendors}
      />

      {active && (
        <button
          onClick={() => onFilters({ search: "", category: "all", creator: "all" })}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-terracotta bg-terracotta/6 px-2.5 text-[11.5px] font-semibold text-terracotta"
        >
          <X size={13} strokeWidth={1.8} /> Clear filters
        </button>
      )}

      {/* Radius. "All" is the escape hatch from the distance limit — the eye
          toggle below is an on/off for vendor pins, not a see-everything. */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.8px] text-terracotta">
          Nearby to Add
        </span>
        <span className="flex-1" />
        {RADII.map((km) => (
          <button
            key={km}
            onClick={() => onRadiusChange(km)}
            aria-pressed={radiusKm === km}
            className={radiusKm === km
              ? "min-h-11 min-w-11 rounded-full border border-forest bg-forest px-2 text-[11px] text-white"
              : "min-h-11 min-w-11 rounded-full border border-sand px-2 text-[11px] text-muted"}
          >
            {km === "all" ? "All" : `${km}km`}
          </button>
        ))}
      </div>

      <button
        onClick={onToggleAllVendors}
        aria-pressed={showAllVendors}
        className={showAllVendors
          ? "flex min-h-11 items-center gap-1.5 text-[11.5px] text-forest"
          : "flex min-h-11 items-center gap-1.5 text-[11.5px] text-muted"}
      >
        {showAllVendors
          ? <Eye size={13} strokeWidth={1.8} />
          : <EyeOff size={13} strokeWidth={1.8} />}
        {showAllVendors ? "Showing vendors on map" : "Vendors hidden on map"}
      </button>

      {nearby.length > 0 ? (
        <div className="mt-1.5">
          {nearby.map((v) => {
            const inTrip = tripIds.has(v.id);
            return (
              <div
                key={v.id}
                onClick={() => onSelectNearby?.(v)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5"
              >
                <img src={placeholderImage(v)} alt="" className="size-7.5 shrink-0 rounded-full object-cover" />
                <span className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink">{v.name}</div>
                  <div className="text-[11px] text-muted">
                    {[distanceLabel(v), priceLabel(v)].filter(Boolean).join(" · ")}
                  </div>
                </span>
                {inTrip ? (
                  <span className="shrink-0 px-1 text-[10.5px] font-semibold text-success">In trip</span>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddStop(v); }}
                    aria-label={`Add ${v.name} to trip`}
                    className="grid size-11 shrink-0 place-items-center text-terracotta"
                  >
                    <Plus size={16} strokeWidth={1.8} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1.5 text-[11.5px] text-muted">
          {!hasAnchor
            ? "Set your starting point to see nearby vendors."
            : active
              ? "Nothing matches those filters."
              : `Nothing within ${radiusKm}km — try a bigger radius or All.`}
        </div>
      )}
    </>
  );
}
