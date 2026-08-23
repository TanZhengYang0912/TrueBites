import { useEffect } from "react";
import { AdvancedMarker, APIProvider, Map as GMap, Pin, useMap } from "@vis.gl/react-google-maps";
import { MAP_COLORS } from "../../lib/mapColors";

const MELAKA_CENTER = { lat: 2.1896, lng: 102.2501 };
const API_KEY = import.meta.env.VITE_MAPS_BROWSER_KEY;
const MAP_ID = import.meta.env.VITE_MAP_ID || "DEMO_MAP_ID";

function coordinatesFor(vendor) {
  const lat = Number(vendor.latitude);
  const lng = Number(vendor.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function FitVendorBounds({ vendors }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !vendors.length || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    vendors.forEach((vendor) => bounds.extend(coordinatesFor(vendor)));
    map.fitBounds(bounds, 56);
    if (vendors.length === 1) map.setZoom(16);
  }, [map, vendors]);

  return null;
}

export default function AdminVendorMap({ vendors, onSelect, onDragEnd }) {
  const mappedVendors = vendors
    .map((vendor) => ({ vendor, position: coordinatesFor(vendor) }))
    .filter((item) => item.position);

  if (!API_KEY) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-sm text-amber-800">
        Map preview is unavailable because the Google Maps browser key is not configured.
      </div>
    );
  }

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-gray-200 bg-slate-100 shadow-sm">
      <APIProvider apiKey={API_KEY} libraries={["marker"]}>
        <GMap
          defaultCenter={MELAKA_CENTER}
          defaultZoom={13}
          mapId={MAP_ID}
          gestureHandling="greedy"
          className="h-[min(68vh,620px)] min-h-[420px] w-full"
        >
          <FitVendorBounds vendors={mappedVendors.map(({ vendor }) => vendor)} />
          {mappedVendors.map(({ vendor, position }) => (
            <AdvancedMarker
              key={vendor.id}
              position={position}
              draggable
              onClick={() => onSelect(vendor)}
              onDragEnd={(event) => {
                const latLng = event.latLng;
                if (!latLng) return;
                const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng.lat;
                const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng.lng;
                onDragEnd(vendor, { lat, lng });
              }}
            >
              <Pin
                background={vendor.status === "active" ? MAP_COLORS.success : MAP_COLORS.warning}
                glyphColor="#fff"
                borderColor="#fff"
                scale={1.1}
              />
            </AdvancedMarker>
          ))}
        </GMap>
      </APIProvider>

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/80 bg-white/95 px-4 py-3 text-xs shadow-md">
        <strong className="block text-sm text-gray-900">Vendor pins</strong>
        <span className="text-gray-500">Drag a pin to adjust its location · {mappedVendors.length} mapped</span>
      </div>

      {mappedVendors.length < vendors.length && (
        <div className="absolute bottom-4 left-4 rounded-lg border border-amber-200 bg-amber-50/95 px-4 py-2 text-xs text-amber-800 shadow-md">
          {vendors.length - mappedVendors.length} vendor{vendors.length - mappedVendors.length === 1 ? "" : "s"} missing coordinates and not shown.
        </div>
      )}
    </div>
  );
}
