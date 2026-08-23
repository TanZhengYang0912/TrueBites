import { useEffect, useRef, useCallback } from "react";
import {
  AdvancedMarker,
  Pin,
  InfoWindow,
  Circle,
  useMap,
} from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { MAP_COLORS } from "../lib/mapColors";

// Renders vendor pins with clustering, plus numbered pins for trip stops and a
// "you are here" marker. Vendor data comes from Supabase: { id, name, address,
// latitude, longitude }.
export default function VendorMarkers({ vendors, userPos, onSelect, onAddStop, tripOrder, userStopNumber, selectedId, openId, onOpenChange, radiusCenter, radiusKm }) {
  const map = useMap();
  const clusterer = useRef(null);
  const markers = useRef({});

  useEffect(() => {
    if (document.getElementById("user-loc-marker-style")) return;
    const s = document.createElement("style");
    s.id = "user-loc-marker-style";
    s.textContent = `.user-loc-dot{width:14px;height:14px;border-radius:50%;background:#1d72e8;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(29,114,232,.4);animation:userPulse 2s ease-in-out infinite}@keyframes userPulse{0%,100%{box-shadow:0 0 0 3px rgba(29,114,232,.35),0 2px 6px rgba(29,114,232,.3)}50%{box-shadow:0 0 0 11px rgba(29,114,232,0),0 2px 6px rgba(29,114,232,.3)}}`;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) clusterer.current = new MarkerClusterer({ map });
  }, [map]);

  useEffect(() => {
    if (!clusterer.current) return;
    clusterer.current.clearMarkers();
    clusterer.current.addMarkers(Object.values(markers.current));
  }, [vendors, tripOrder, selectedId]);

  // Trip stops and the selected pin carry meaning (their number, their red
  // highlight) that a cluster bubble would swallow — two nearby stops would
  // collapse into an anonymous "2" bubble instead of showing stop 2 and stop 3.
  // Keep those out of the clusterer entirely so they always render individually.
  const setMarkerRef = useCallback((marker, id, excludeFromCluster) => {
    if (marker && !excludeFromCluster) markers.current[id] = marker;
    else delete markers.current[id];
  }, []);

  // Trip stops that share the exact same coordinates (confirmed real case: two
  // vendors both geocoded to the same generic area centroid, e.g. no street
  // address available) would otherwise stack one pin exactly on top of the
  // other, hiding it completely. Nudge duplicates apart in a small circle so
  // every stop stays visible and clickable.
  const positionKey = (v) => `${v.latitude.toFixed(5)},${v.longitude.toFixed(5)}`;
  const tripStopGroups = {};
  vendors.forEach((v) => {
    if (!tripOrder?.has(v.id)) return;
    const key = positionKey(v);
    (tripStopGroups[key] ||= []).push(v.id);
  });
  const JITTER_DEG = 0.0013; // ~140m — visible apart at typical trip-viewing zoom, still negligible on the map
  const displayPosition = (v) => {
    const group = tripStopGroups[positionKey(v)];
    if (!group || group.length < 2) return { lat: v.latitude, lng: v.longitude };
    const idx = group.indexOf(v.id);
    const angle = (2 * Math.PI * idx) / group.length;
    return {
      lat: v.latitude + JITTER_DEG * Math.sin(angle),
      lng: v.longitude + JITTER_DEG * Math.cos(angle),
    };
  };

  return (
    <>
      {/* The radius the "Nearby to add" list and the vendor pins are filtered by.
          clickable={false} is load-bearing — at 10 km this covers the whole
          viewport and would otherwise swallow every pin click. */}
      {radiusCenter && radiusKm && (
        <Circle
          center={radiusCenter}
          radius={radiusKm * 1000}
          clickable={false}
          strokeColor={MAP_COLORS.forest}
          strokeOpacity={0.5}
          strokeWeight={1.5}
          fillColor={MAP_COLORS.forest}
          fillOpacity={0.06}
        />
      )}
      {vendors.map((v) => {
        const stopNum = tripOrder?.get(v.id);
        // AI-extracted vendors that only had a city/state (no street address) get
        // geocoded to a city centroid, not the real spot — the question-mark pin
        // flags that uncertainty without obscuring the entire map with ranges.
        const isApproximate = v.location_precision === "city_level" || v.location_precision === "unknown";
        const isSelected = v.id === selectedId;
        const pos = displayPosition(v);
        return (
          <div key={v.id}>
            <AdvancedMarker
              position={pos}
              ref={(marker) => setMarkerRef(marker, v.id, Boolean(stopNum) || isSelected)}
              onClick={() => { onOpenChange(v.id); onSelect(v); }}
              zIndex={isSelected ? 999 : undefined}
            >
              <Pin
                background={isSelected ? MAP_COLORS.danger : stopNum ? MAP_COLORS.terracotta : isApproximate ? MAP_COLORS.warning : MAP_COLORS.success}
                glyphColor="#fff"
                borderColor="#fff"
                scale={isSelected ? 1.5 : 1}
                glyph={stopNum ? String(stopNum) : isSelected ? undefined : isApproximate ? "?" : ""}
              />
            </AdvancedMarker>
          </div>
        );
      })}

      {openId &&
        vendors
          .filter((v) => v.id === openId)
          .map((v) => (
            <InfoWindow
              key={v.id}
              position={displayPosition(v)}
              onCloseClick={() => onOpenChange(null)}
            >
              <div className="max-w-[220px] font-body">
                <strong className="break-words">{v.name}</strong>
                {v.address && <div className="my-0.5 break-words text-xs text-[#555]">{v.address}</div>}
                {(v.location_precision === "city_level" || v.location_precision === "unknown") && (
                  <div className="my-0.5 text-[11px] text-[#b35c00]">
                    ⚠️ Approximate location — exact address not confirmed
                  </div>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${v.name} ${v.latitude},${v.longitude}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center rounded bg-forest px-3 text-xs text-white no-underline"
                >
                  View details ↗
                </a>
                {onAddStop && (
                  <button
                    onClick={() => onAddStop(v)}
                    disabled={tripOrder?.has(v.id)}
                    className={tripOrder?.has(v.id)
                      ? "ml-1.5 mt-2 inline-flex min-h-11 items-center rounded-md bg-[#eee] px-3 text-xs text-[#777]"
                      : "ml-1.5 mt-2 inline-flex min-h-11 items-center rounded-md bg-success px-3 text-xs text-white"}
                  >
                    {tripOrder?.has(v.id) ? `✓ Stop ${tripOrder.get(v.id)}` : "➕ Add stop"}
                  </button>
                )}
              </div>
            </InfoWindow>
          ))}

      {/* While it's a trip stop, "Your location" is drawn as the same numbered
          pin as every other stop — a differently-shaped marker in the middle of
          a numbered route reads as a different kind of thing. It falls back to
          the pulsing dot only once removed from the trip, where it means
          "you are here" rather than "stop N". */}
      {userPos && (
        <AdvancedMarker position={userPos} title="You are here">
          {userStopNumber
            ? <Pin background={MAP_COLORS.terracotta} glyphColor="#fff" borderColor="#fff" glyph={String(userStopNumber)} />
            : <div className="user-loc-dot" />}
        </AdvancedMarker>
      )}
    </>
  );
}
