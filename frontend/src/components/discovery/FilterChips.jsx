import { useRef } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import {
  CATEGORY_FILTERS,
  MORE_CATEGORY_OPTIONS,
  categoryMatches,
  creatorHandle,
} from "../../lib/vendorDisplay";

const MUTED = "#69717A";

const ICONS = {
  all: "🍽️",
  local: "🍲",
  cafe: "☕",
  nyonya: "👘",
  western: "🥩",
  middle_eastern: "🌮",
  chinese: "🍜",
  korean: "🇰🇷",
};

const CHIP = "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors active:scale-97 motion-reduce:transition-none";
const CHIP_IDLE = `${CHIP} border-sand bg-white text-muted hover:border-forest hover:text-forest`;
const CHIP_ACTIVE = `${CHIP} border-forest bg-forest text-white`;
const SELECT = "min-h-11 rounded-md border border-sand bg-white px-3 text-[13px] text-ink outline-none focus:border-forest";
const SCROLL_BUTTON = "flex size-11 shrink-0 items-center justify-center rounded-md border border-sand bg-white text-muted transition-colors hover:border-forest hover:text-forest disabled:pointer-events-none disabled:opacity-30";

function countFor(vendors, key) {
  return vendors.filter((vendor) => categoryMatches(vendor, key)).length;
}

export default function FilterChips({ active, onSelect, creator, onCreatorSelect, vendors = [] }) {
  const scrollerRef = useRef(null);
  const availableMore = MORE_CATEGORY_OPTIONS.filter((option) => countFor(vendors, option.key) > 0);
  const allCategories = [...CATEGORY_FILTERS, ...availableMore];
  const creatorCounts = new Map();
  vendors.forEach((vendor) => {
    const handle = creatorHandle(vendor);
    if (handle) creatorCounts.set(handle, (creatorCounts.get(handle) || 0) + 1);
  });
  const creators = [...creatorCounts.entries()].sort((a, b) => b[1] - a[1]);

  function scrollByStep(direction) {
    scrollerRef.current?.scrollBy({ left: direction * 160, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          className={SCROLL_BUTTON}
          aria-label="Scroll categories left"
        >
          <ChevronLeft size={16} />
        </button>

        <div
          ref={scrollerRef}
          className="no-scrollbar flex min-w-0 max-w-[calc(100vw-9rem)] items-center gap-2 overflow-x-auto scroll-smooth sm:max-w-[420px] lg:max-w-[560px]"
          style={{ scrollbarWidth: "none" }}
        >
          {allCategories.map(({ key, label }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                className={isActive ? CHIP_ACTIVE : CHIP_IDLE}
                aria-pressed={isActive}
              >
                {ICONS[key] && <span aria-hidden="true">{ICONS[key]}</span>}
                <span>{label}</span>
                <small className={isActive ? "opacity-70" : "opacity-55"}>{countFor(vendors, key)}</small>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollByStep(1)}
          className={SCROLL_BUTTON}
          aria-label="Scroll categories right"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Divider becomes a full-width rule once the bar stacks */}
      <div className="h-px w-full bg-sand md:h-6 md:w-px" />

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Users size={14} color={MUTED} />
        <span className="text-[13px] text-muted">Recommended by</span>
        <select
          value={creator}
          onChange={(event) => onCreatorSelect(event.target.value)}
          className={`min-w-0 max-w-full ${SELECT}`}
          aria-label="Recommended by influencer"
        >
          <option value="all">All creators</option>
          {creators.map(([handle, count]) => (
            <option key={handle} value={handle}>{handle} ({count})</option>
          ))}
        </select>
      </div>
    </div>
  );
}
