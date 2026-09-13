import { useEffect, useRef } from "react";
import { AdvancedMarker, Map as GMap, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
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
export default function VendorLocationPicker({ latitude, longitude, onChange, disabled, loadError, notify }) {
  const lat = parseCoord(latitude, -90, 90);
  const lng = parseCoord(longitude, -180, 180);
  const hasCoords = lat != null && lng != null;
  const position = hasCoords ? { lat, lng } : MELAKA_CENTER;

  // Reverse-geocodes a drag back into the address field — same "geocoding"
  // library AddressAutocompleteField's Places widget uses for the forward
  // direction, so a drag stops being the one path that could leave the
  // address text describing somewhere other than where the pin actually
  // sits. Built once per mount and kept in a ref (not state) since the
  // Geocoder instance itself never needs to trigger a re-render.
  const geocodingLib = useMapsLibrary("geocoding");
  const geocoderRef = useRef(null);
  useEffect(() => {
    if (geocodingLib) geocoderRef.current = new geocodingLib.Geocoder();
  }, [geocodingLib]);
  // onDragEnd is attached once below and must always call the LATEST
  // onChange/notify — same ref-freshening AddressAutocompleteField uses —
  // otherwise switching which vendor is being edited without unmounting
  // this component would keep writing into a stale closure.
  const onChangeRef = useRef(onChange);
  const notifyRef = useRef(notify);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { notifyRef.current = notify; }, [notify]);

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

              // Best-effort only: the drag itself already committed the real
              // signal (the coordinates) above, so a failed/slow lookup here
              // must never block or revert that — it just leaves the address
              // text as whatever it was until this resolves (or forever, if
              // it never does).
              const geocoder = geocoderRef.current;
              if (!geocoder) return;
              geocoder.geocode({ location: { lat: nextLat, lng: nextLng } })
                .then(({ results }) => {
                  const label = results?.[0]?.formatted_address;
                  if (label) {
                    onChangeRef.current({ target: { name: "address", value: label } });
                  } else {
                    notifyRef.current?.("Pin moved, but no address was found for that exact spot — enter one manually if needed.", true);
                  }
                })
                .catch(() => {
                  notifyRef.current?.("Pin moved, but the address lookup failed — coordinates were still updated.", true);
                });
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
