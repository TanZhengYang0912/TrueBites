import { useMemo, useState } from "react";
import { Bookmark, Check, MapPin, Plus, Star, Wallet } from "lucide-react";
import {
  categoryLabel, vendorGallery, creatorHandle,
  priceRangeLabel, hoursStatus, photoAltText, FOOD_PHOTO_POSITION,
} from "../../lib/vendorDisplay";
import VendorGallery from "./VendorGallery";

const TERRACOTTA = "#A35D47";
const INK = "#202A35";
const OPEN_GREEN = "#2F9E44";
const CLOSED_RED = "#C92A2A";

// Fixed 4:3 aspect ratio (not a fixed pixel height) so proportions hold
// correctly at every breakpoint — a card's width already changes with the
// grid's column count (1/2/3-4 per row), and a flat height only ever looked
// right at one of those widths.
const IMAGE = "relative aspect-[4/3] cursor-pointer bg-sand";

export default function VendorCard({ vendor, inTrip, bookmarked, onToggleBookmark, onAddStop, onOpenDetail }) {
  const handle = creatorHandle(vendor);
  const price = priceRangeLabel(vendor);
  const hours = hoursStatus(vendor);
  const area = vendor.address?.split(",")[0]?.trim() || "Melaka";
  const description = vendor.ai_review_summary || vendor.signature_dishes || "A local place worth taking the long way for.";
  const images = useMemo(() => vendorGallery(vendor), [vendor]);
  const [hovered, setHovered] = useState(false);

  return (
    <article className="min-w-0 overflow-hidden rounded border border-sand bg-white transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-forest hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div
        className={IMAGE}
        role="button"
        tabIndex={0}
        aria-label={`View photos of ${vendor.name}`}
        onClick={() => onOpenDetail(vendor)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenDetail(vendor);
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        {/* Cycles through the storefront cover + food photos while the
            pointer stays over the card (or it's keyboard-focused); snaps back
            to the cover when hover/focus ends. On a touch device (no real
            hover) tapping the photo instead advances it one at a time —
            tapToAdvance — since there's no hover to preview the gallery with. */}
        <VendorGallery
          images={images}
          alt={(_, i) => photoAltText(vendor, i)}
          active={hovered}
          resetOnInactive
          interval={2200}
          objectPosition={FOOD_PHOTO_POSITION}
          tapToAdvance
        />

        {/* Unifies photos shot by different creators under different
            lighting into one consistent-looking set (same treatment as the
            detail modal's hero), and improves contrast for the badge below. */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(64,84,74,0.55)_0%,transparent_45%)]" />

        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggleBookmark(vendor.id); }}
          aria-label={bookmarked ? "Remove saved place" : "Save place"}
          title={bookmarked ? "Remove saved place" : "Save place"}
          className="absolute right-2 top-2 grid size-11 place-items-center rounded-sm border border-white/80 bg-white/90 text-ink transition-colors hover:text-terracotta active:scale-97 motion-reduce:transition-none"
        >
          <Bookmark size={16} fill={bookmarked ? TERRACOTTA : "none"} color={bookmarked ? TERRACOTTA : INK} strokeWidth={1.7} />
        </button>
      </div>

      <div className="flex min-h-[166px] flex-col p-4">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="font-bold uppercase tracking-[0.08em] text-terracotta">{categoryLabel(vendor)}</span>
          <span className="text-sand">·</span>
          <span className="truncate font-medium text-muted">{handle || "TrueBites guide"}</span>
        </div>

        <h2
          onClick={() => onOpenDetail(vendor)}
          className="m-0 mt-1.5 cursor-pointer font-display text-[19px] font-semibold leading-[1.15] text-ink"
        >
          {vendor.name}
        </h2>
        <p className="mb-1 mt-2 line-clamp-2 overflow-hidden text-xs leading-normal text-muted">
          {description}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5 text-[11px] text-muted [&_svg]:shrink-0">
          <MapPin size={12} />
          <span>{area}</span>
          <span className="text-sand">·</span>
          <Star size={12} color={TERRACOTTA} fill={vendor.review_count > 0 ? TERRACOTTA : "none"} />
          {vendor.review_count > 0 ? (
            <span><strong>{Number(vendor.average_rating).toFixed(1)}</strong> ({vendor.review_count})</span>
          ) : (
            <span>—</span>
          )}
          {price && <><span className="text-sand">·</span><Wallet size={12} /><span>{price}</span></>}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {hours ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: hours.isOpen ? OPEN_GREEN : CLOSED_RED }} />
              <span className="font-semibold" style={{ color: hours.isOpen ? OPEN_GREEN : CLOSED_RED }}>
                {hours.isOpen ? "Open now" : "Closed"}
              </span>
              <span className="truncate text-muted">· {hours.label}</span>
            </span>
          ) : <span />}
          <button
            type="button"
            onClick={() => !inTrip && onAddStop(vendor)}
            disabled={inTrip}
            aria-label={inTrip ? "Already added to trip" : "Add to trip"}
            className={inTrip
              ? "inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-muted"
              : "inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-forest active:scale-97"}
          >
            {inTrip ? <Check size={12} /> : <Plus size={12} />}
            {inTrip ? "Added" : "Add to trip"}
          </button>
        </div>
      </div>
    </article>
  );
}
