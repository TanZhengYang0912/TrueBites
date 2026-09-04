import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Map } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import { subscribeTripCount, tripOwner } from "../lib/tripStorage";

// Global floating action button — appears on every page once the trip has at
// least one stop, and jumps to the map. Hidden only on the map itself (/map)
// since the trip panel there already shows the same count — the Discover list
// lives at /discover and should still show the FAB.
export default function TripFab() {
  const [count, setCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const owner = tripOwner(session);

  useEffect(() => {
    if (loading) { setCount(0); return undefined; }
    return subscribeTripCount(setCount, owner);
  }, [loading, owner]);

  const onMapView = location.pathname === "/map";
  if (count === 0 || onMapView) return null;

  return (
    <button
      onClick={() => navigate("/map")}
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
