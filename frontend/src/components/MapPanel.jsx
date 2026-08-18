import { Navigation, ChevronDown, UtensilsCrossed } from "lucide-react";
import { MAP_COLORS } from "../lib/mapColors";

// Bottom sheet on phones, floating side panel from md up. Same component and
// same tabs in both — only the docking differs.
const PANEL =
  "fixed inset-x-0 bottom-0 z-20 flex max-h-[64dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-sand bg-white shadow-2xl " +
  "md:absolute md:inset-x-auto md:bottom-auto md:right-4 md:top-[132px] md:max-h-[78vh] md:w-[340px] md:rounded-xl";

const COLLAPSED =
  "fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-sand bg-white px-3.5 text-[13px] font-semibold text-forest shadow-[0_4px_20px_rgba(64,84,74,0.18)] " +
  "md:absolute md:inset-x-auto md:bottom-auto md:right-4 md:top-[132px] md:w-[300px]";

const TAB = "flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-2.5 text-[12.5px] font-semibold";
const TAB_ON = `${TAB} border-forest text-forest`;
const TAB_OFF = `${TAB} border-transparent text-muted hover:text-forest`;

export default function MapPanel({ tab, onTab, collapsed, onToggleCollapsed, tripCount, children }) {
  if (collapsed) {
    return (
      <button onClick={onToggleCollapsed} className={COLLAPSED}>
        <Navigation size={15} strokeWidth={1.8} color={MAP_COLORS.terracotta} />
        {tripCount > 0 ? `${tripCount} ${tripCount === 1 ? "stop" : "stops"}` : "Your Trip"}
      </button>
    );
  }

  return (
    <div className={PANEL}>
      <div role="tablist" aria-label="Map panel" className="flex shrink-0 items-center gap-1 border-b border-sand bg-chalk px-2 pt-1">
        <button
          role="tab"
          aria-selected={tab === "trip"}
          onClick={() => onTab("trip")}
          className={tab === "trip" ? TAB_ON : TAB_OFF}
        >
          <Navigation size={14} strokeWidth={1.8} /> Trip
          {tripCount > 0 && (
            <span className={tab === "trip"
              ? "rounded-full bg-forest px-1.5 text-[10px] font-bold tabular-nums text-white"
              : "rounded-full bg-sand px-1.5 text-[10px] font-bold tabular-nums text-muted"}>
              {tripCount}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={tab === "vendors"}
          onClick={() => onTab("vendors")}
          className={tab === "vendors" ? TAB_ON : TAB_OFF}
        >
          <UtensilsCrossed size={14} strokeWidth={1.8} /> Vendors
        </button>
        <button onClick={onToggleCollapsed} aria-label="Collapse panel" className="grid size-11 shrink-0 place-items-center text-muted">
          <ChevronDown size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
