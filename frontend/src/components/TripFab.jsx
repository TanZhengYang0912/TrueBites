import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Map } from "lucide-react";
import { subscribeTripCount } from "../lib/tripStorage";

// Global floating action button — appears on every page once the trip has at
// least one stop, and jumps to the map. Hidden only on the actual pin-map
// view (/map?view=map) since the trip panel there already shows the same
// count — the Discover view lives at the same /map path (default view) and
// should still show the FAB.
export default function TripFab() {
  const [count, setCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => subscribeTripCount(setCount), []);

  const onMapView = location.pathname === "/map" && new URLSearchParams(location.search).get("view") === "map";
  if (count === 0 || onMapView) return null;

  return (
    <button
      onClick={() => navigate("/map?view=map")}
      aria-label={`Open trip map (${count} ${count === 1 ? "stop" : "stops"})`}
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 grid size-14 place-items-center rounded-full bg-forest text-white shadow-[0_4px_20px_rgba(64,84,74,0.35)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transition-none"
    >
      <Map size={22} strokeWidth={1.8} />
      <span className="absolute -right-1 -top-1 grid min-w-[20px] place-items-center rounded-full border-2 border-chalk bg-terracotta px-1 text-[11px] font-bold tabular-nums text-white">
        {count}
      </span>
    </button>
  );
}
