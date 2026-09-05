import { useEffect, useRef, useCallback } from "react";
import {
  AdvancedMarker,
  InfoWindow,
  useAdvancedMarkerRef,
  useMap,
} from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { MAP_COLORS } from "../lib/mapColors";
import { vendorGallery, FOOD_PHOTO_POSITION } from "../lib/vendorDisplay";

// Keep clustered vendors visually consistent with the rest of TrueBites.
// Google Maps' built-in renderer switches between blue and red based on local
// density, which implies a distinction we do not make in the product.
export function createBrandClusterRenderer() {
  return {
    render({ count, position }) {
      const scale = count >= 100 ? 25 : count >= 10 ? 22 : 19;
      const fontSize = count >= 100 ? "12px" : "13px";

      return new google.maps.Marker({
        position,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: MAP_COLORS.forest,
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeOpacity: 1,
          strokeWeight: 3,
          scale,
        },
        label: {
          text: String(count),
          color: "#FFFFFF",
          fontFamily: "Arial, sans-serif",
          fontSize,
          fontWeight: "700",
        },
        title: `${count} vendors`,
        zIndex: 1000 + count,
      });
    },
  };
}

function HawkerStallPin({ selected = false, stopNum = null }) {
  const numbered = stopNum !== null && stopNum !== undefined;
  const fill = selected || numbered ? MAP_COLORS.terracotta : MAP_COLORS.forest;

  return (
    <svg
      width={selected ? 53 : 46}
      height={selected ? 67 : 58}
      viewBox="0 0 46 58"
      aria-hidden="true"
      focusable="false"
      className="drop-shadow-md"
    >
      <path
        d="M23 2C11.4 2 2 11.1 2 22.4c0 14 21 33.2 21 33.2s21-19.2 21-33.2C44 11.1 34.6 2 23 2Z"
        fill={fill}
        stroke="#FFFDF8"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {numbered ? (
        <text
          x="23"
          y="22"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#FFFDF8"
          fontFamily="Arial, sans-serif"
          fontSize={Number(stopNum) >= 10 ? "12" : "15"}
          fontWeight="700"
        >
          {stopNum}
        </text>
      ) : (
        <>
          <path d="M13.5 18.5h19l-2.6-5.2H16.1l-2.6 5.2Z" fill="#FFFDF8" />
          <path
            d="M15.8 20.5v10.2h14.4V20.5M20.2 30.7v-6h5.6v6"
            fill="none"
            stroke="#FFFDF8"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

// Renders vendor pins with clustering, plus numbered pins for trip stops and a
// "you are here" marker. Vendor data comes from Supabase: { id, name, address,
// latitude, longitude }.
function VendorMarker({ vendor, position, stopNum, isSelected, onSelect, onOpenChange, onMarkerChange }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const excludeFromCluster = Boolean(stopNum) || isSelected;

  useEffect(() => {
    onMarkerChange(vendor.id, marker, excludeFromCluster);
    return () => onMarkerChange(vendor.id, null, true);
  }, [vendor.id, marker, excludeFromCluster, onMarkerChange]);

  return (
    <AdvancedMarker
      position={position}
      title={vendor.name}
      ref={markerRef}
      onClick={() => { onOpenChange(vendor.id); onSelect(vendor); }}
      zIndex={isSelected ? 999 : undefined}
    >
      <HawkerStallPin selected={isSelected} stopNum={stopNum} />
    </AdvancedMarker>
  );
}

export default function VendorMarkers({ vendors, userPos, onSelect, onAddStop, onViewDetails, tripOrder, userStopNumber, selectedId, openId, onOpenChange }) {
  const map = useMap();
  const clusterer = useRef(null);
  const markers = useRef({});

  const refreshCluster = useCallback(() => {
    if (!clusterer.current) return;
    clusterer.current.clearMarkers();
    clusterer.current.addMarkers(Object.values(markers.current));
  }, []);

  const setClusterMarker = useCallback((id, marker, excludeFromCluster) => {
    if (marker && !excludeFromCluster) {
      if (markers.current[id] === marker) return;
      markers.current[id] = marker;
    } else {
      if (!markers.current[id]) return;
      delete markers.current[id];
    }
    refreshCluster();
  }, [refreshCluster]);

  useEffect(() => {
    if (document.getElementById("user-loc-marker-style")) return;
    const s = document.createElement("style");
    s.id = "user-loc-marker-style";
    s.textContent = `.user-loc-dot{width:14px;height:14px;border-radius:50%;background:#1d72e8;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(29,114,232,.4);animation:userPulse 2s ease-in-out infinite}@keyframes userPulse{0%,100%{box-shadow:0 0 0 3px rgba(29,114,232,.35),0 2px 6px rgba(29,114,232,.3)}50%{box-shadow:0 0 0 11px rgba(29,114,232,0),0 2px 6px rgba(29,114,232,.3)}}`;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!map) return;
    const nextClusterer = new MarkerClusterer({ map, renderer: createBrandClusterRenderer() });
    clusterer.current = nextClusterer;
    refreshCluster();
    return () => {
      nextClusterer.clearMarkers();
      nextClusterer.setMap(null);
      if (clusterer.current === nextClusterer) clusterer.current = null;
    };
  }, [map, refreshCluster]);

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
      {vendors.map((v) => {
        const stopNum = tripOrder?.get(v.id);
        const isSelected = v.id === selectedId;
        const pos = displayPosition(v);
        return (
          <VendorMarker
            key={v.id}
            vendor={v}
            position={pos}
            stopNum={stopNum}
            isSelected={isSelected}
            onSelect={onSelect}
            onOpenChange={onOpenChange}
            onMarkerChange={setClusterMarker}
          />
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
                <img
                  src={vendorGallery(v)[0]}
                  alt=""
                  loading="lazy"
                  className="mb-2 block h-[110px] w-full rounded-md object-cover"
                  style={{ objectPosition: FOOD_PHOTO_POSITION }}
                />
                <strong className="break-words">{v.name}</strong>
                {v.address && <div className="my-0.5 break-words text-xs text-[#555]">{v.address}</div>}
                {onViewDetails && (
                  <button
                    type="button"
                    onClick={() => onViewDetails(v)}
                    className="mt-2 inline-flex min-h-11 items-center rounded-md bg-forest px-3 text-xs text-white"
                  >
                    View details
                  </button>
                )}
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

      {/* While it's a trip stop, "Your location" is drawn as the same numbered Hawker Stall
          pin as every other stop — a differently-shaped marker in the middle of
          a numbered route reads as a different kind of thing. It falls back to
          the pulsing dot only once removed from the trip, where it means
          "you are here" rather than "stop N". */}
      {userPos && (
        <AdvancedMarker position={userPos} title="You are here">
          {userStopNumber
            ? <HawkerStallPin stopNum={userStopNumber} />
            : <div className="user-loc-dot" />}
        </AdvancedMarker>
      )}
    </>
  );
}
