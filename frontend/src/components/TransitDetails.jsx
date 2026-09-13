const VEHICLE_ICON = {
  BUS: "🚌",
  RAIL: "🚆",
  SUBWAY: "🚇",
  TRAM: "🚊",
  HEAVY_RAIL: "🚆",
  COMMUTER_TRAIN: "🚆",
};

const MUTED = "#69717A";

// Vertical itinerary ribbon: one node per leg, transit nodes painted in that
// line's real Google color so KJ Line red / MRT green etc. show through —
// the one piece of "real world" color let into the app's warm palette.
export default function TransitDetails({ legs }) {
  if (!legs || legs.length === 0) return null;

  return (
    <div className="my-2">
      {legs.map((leg, i) => (
        <div key={i} className="relative flex gap-2">
          <div className="flex w-3.5 flex-col items-center">
            {/* Node colour is the real Google line colour — runtime data. */}
            <span
              className="size-2.5 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_#D8D2C8]"
              style={{ background: leg.kind === "transit" ? leg.lineColor : MUTED }}
            />
            {i < legs.length - 1 && <span className="min-h-4.5 w-0.5 flex-1 bg-sand" />}
          </div>
          <div className="min-w-0 flex-1 pb-3 text-[12.5px] text-ink">
            {leg.kind === "transit" ? (
              <>
                <div className="break-words font-semibold">
                  {VEHICLE_ICON[leg.vehicle] || "🚏"} {leg.lineName}
                  {leg.departureTime && leg.arrivalTime && (
                    <span className="font-normal tabular-nums text-muted">
                      {" "}· {leg.departureTime}→{leg.arrivalTime}
                    </span>
                  )}
                </div>
                {leg.numStops != null && (
                  <div className="text-[11.5px] text-muted">{leg.numStops} stops</div>
                )}
              </>
            ) : (
              <div className="break-words text-muted">
                🚶 {leg.instructions || "Walk"}{leg.duration ? ` · ${leg.duration}` : ""}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
