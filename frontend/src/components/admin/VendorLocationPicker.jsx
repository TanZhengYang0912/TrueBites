import { useEffect, useRef } from "react";
import { AdvancedMarker, Map as GMap, Pin, useMap } from "@vis.gl/react-google-maps";
import { MAP_COLORS } from "../../lib/mapColors";

// Same default centre/keys as AdminVendorMap.jsx and MapPage.jsx — every map
// in the app agrees on where "no location yet" should point.
const MELAKA_CENTER = { lat: 2.1896, lng: 102.2501 };
const API_KEY = import.meta.env.VITE_MAPS_BROWSER_KEY;
const MAP_ID = import.meta.env.VITE_MAP_ID || "DEMO_MAP_ID";

function parseCoord(value, min, max) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Pans to the committed position (a drag, an address pick, or a manual edit)
// without touching zoom, so an admin who zoomed in to place a pin precisely
// doesn't get zoomed back out by their own next edit. Zoom is set once, on
// first mount, so an existing vendor opens already close-in.
function RecenterOnPosition({ position, hasCoords }) {
  const map = useMap();
  const zoomedOnce = useRef(false);

  useEffect(() => {
    if (!map) return;
    map.panTo(position);
    if (!zoomedOnce.current) {
      map.setZoom(hasCoords ? 19 : 15);
      zoomedOnce.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, position.lat, position.lng]);

  return null;
}

// Draggable-marker location picker embedded directly in the Add/Edit Vendor
// form. It's a thin, controlled view over the same latitude/longitude form
// fields the admin can also type into — dragging the pin is just another way
// to set those two values, never a second source of truth. `onChange` uses
// the same `{ target: { name, value } }` shape as every other field in
// VendorFormFields (see AddressAutocomplete's pick()), so it drops straight
// into the existing handleChange/setForm wiring with no extra plumbing.
export default function VendorLocationPicker({ latitude, longitude, onChange, disabled, loadError }) {
  const lat = parseCoord(latitude, -90, 90);
  const lng = parseCoord(longitude, -180, 180);
  const hasCoords = lat != null && lng != null;
  const position = hasCoords ? { lat, lng } : MELAKA_CENTER;

  if (!API_KEY) {
    return (
      <div className="admin-field-hint">
        Map preview is unavailable because the Google Maps browser key is not configured — enter latitude/longitude manually.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-field-hint">
        Map preview failed to load ({loadError}) — latitude/longitude can still be entered manually above.
      </div>
    );
  }

  // Shares one <APIProvider> with AddressAutocomplete above (see
  // VendorFormFields in AdminVendorManagementPage.jsx) rather than creating
  // its own — Google Maps JS can only be loaded once per page with one
  // fixed `libraries` list.
  return (
    <label>
      <span>Vendor Location</span>
      <div className="relative h-64 w-full overflow-hidden rounded-xl border border-gray-200 bg-slate-100">
        <GMap
          defaultCenter={position}
          defaultZoom={hasCoords ? 19 : 15}
          mapId={MAP_ID}
          gestureHandling="greedy"
          keyboardShortcuts={false}
          className="size-full"
        >
          <RecenterOnPosition position={position} hasCoords={hasCoords} />
          <AdvancedMarker
            position={position}
            draggable={!disabled}
            onDragEnd={(event) => {
              const latLng = event.latLng;
              if (!latLng) return;
              const nextLat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
              const nextLng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
              if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
              onChange({ target: { name: "latitude", value: String(nextLat) } });
              onChange({ target: { name: "longitude", value: String(nextLng) } });
            }}
          >
            <Pin background={hasCoords ? MAP_COLORS.success : MAP_COLORS.warning} glyphColor="#fff" borderColor="#fff" />
          </AdvancedMarker>
        </GMap>
        {!disabled && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/80 bg-white/95 px-3 py-1.5 text-xs text-gray-700 shadow-md">
            Drag the marker to the exact vendor location.
          </div>
        )}
      </div>
      <span className="admin-field-hint">
        This marker represents the vendor&apos;s exact location. Drag it, pick an address above, or type coordinates directly — all three stay in sync.
      </span>
    </label>
  );
}
