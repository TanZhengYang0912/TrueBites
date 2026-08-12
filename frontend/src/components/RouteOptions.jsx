const OPTION = "mb-1.5 flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 text-left transition-colors motion-reduce:transition-none";

// Lets the user switch between Google's alternative driving routes, each
// flagged with whether it uses tolls (approximate — see DirectionsRenderer).
// Duration leads because it is what the choice turns on; "Route N" was dropped
// because the list is already ordered and the number said nothing else.
export default function RouteOptions({ routes, selectedIndex, onSelect }) {
  if (!routes || routes.length === 0) return null;

  return (
    <div className="my-2">
      {routes.map((r) => {
        const active = r.index === selectedIndex;
        return (
          <button
            key={r.index}
            onClick={() => onSelect(r.index)}
            aria-pressed={active}
            className={active
              ? `${OPTION} border-forest bg-forest/6`
              : `${OPTION} border-sand bg-white hover:border-forest`}
          >
            <span className="text-[13px] font-semibold tabular-nums text-ink">{r.duration}</span>
            <span className="text-[12px] tabular-nums text-muted">{r.distance}</span>
            <span className="flex-1" />
            {r.hasTolls && (
              <span className="shrink-0 rounded-full bg-chalk px-2 py-0.5 text-[10.5px] font-semibold text-terracotta">
                tolls
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
