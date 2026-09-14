import { Plus, Eye, EyeOff } from "lucide-react";
import AdvancedFilters from "./discovery/AdvancedFilters";
import { vendorGallery, priceLabel, distanceLabel } from "../lib/vendorDisplay";

const RADII = [1, 2, 5, "all"];

// The Vendors tab. Browsing lives here so the Trip tab stays a route editor.
// The filters are owned by MapPage rather than this component because the same
// predicate decides which pins the map draws — see the pin rule in MapPage.
export default function VendorPanel({
  vendors, filteredVendors, nearby,
  filters, sort, onFilters, onSort, onClearFilters,
  radiusKm, onRadiusChange,
  showAllVendors, onToggleAllVendors,
  onAddStop, onSelectNearby,
  hasAnchor, visibleCount, onShowMore,
}) {
  const visibleNearby = nearby.slice(0, visibleCount);
  const shown = Math.min(visibleCount, nearby.length);
  return (
    <>
      <AdvancedFilters
        compact
        filters={filters}
        sort={sort}
        onChange={onFilters}
        onSort={onSort}
        onClear={onClearFilters}
        vendors={vendors}
      />

      {/* Radius. "All" is the escape hatch from the distance limit — the eye
          toggle below is an on/off for vendor pins, not a see-everything. */}
      <div className="mt-3 flex items-center gap-1.5">
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

      {visibleNearby.length > 0 ? (
        <div className="mt-1.5">
          {visibleNearby.map((v) => (
            <div
              key={v.id}
              data-testid="nearby-vendor-row"
              onClick={() => onSelectNearby?.(v)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5"
            >
              <img src={vendorGallery(v)[0]} alt="" className="size-7.5 shrink-0 rounded-full object-cover" />
              <span className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-ink">{v.name}</div>
                <div className="text-[11px] text-muted">
                  {[distanceLabel(v), priceLabel(v)].filter(Boolean).join(" · ")}
                </div>
              </span>
              <button
                onClick={(event) => { event.stopPropagation(); onAddStop(v); }}
                aria-label={`Add ${v.name} to trip`}
                className="grid size-11 shrink-0 place-items-center text-terracotta"
              >
                <Plus size={16} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-sand pt-2">
            <span className="text-[11px] text-muted">Showing {shown} of {nearby.length}</span>
            {shown < nearby.length && (
              <button
                type="button"
                onClick={onShowMore}
                className="min-h-11 text-[12px] font-semibold text-terracotta"
              >
                Show 15 more
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-1.5 text-[11.5px] text-muted">
          {!hasAnchor
            ? "Set your search area to see nearby vendors."
            : filteredVendors.length === 0
              ? "Nothing matches those filters."
              : radiusKm === "all"
                ? "No vendors are available."
                : `Nothing within ${radiusKm}km — try a bigger radius or All.`}
        </div>
      )}
    </>
  );
}
