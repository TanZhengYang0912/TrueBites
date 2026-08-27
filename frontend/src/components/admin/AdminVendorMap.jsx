import { useCallback, useEffect, useRef } from "react";
import {
  AdvancedMarker,
  APIProvider,
  Map as GMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
} from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import MelakaHighlight from "../MelakaHighlight";
import { createBrandClusterRenderer } from "../VendorMarkers";
import { MAP_COLORS } from "../../lib/mapColors";
import { filterAdminMapVendors, MELAKA_CENTER } from "../../lib/adminMap";

const API_KEY = import.meta.env.VITE_MAPS_BROWSER_KEY;
const MAP_ID = import.meta.env.VITE_MAP_ID || "DEMO_MAP_ID";

function AdminVendorMarker({ vendor, position, onSelect, onDragEnd, onMarkerChange }) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  useEffect(() => {
    onMarkerChange(vendor.id, marker);
    return () => onMarkerChange(vendor.id, null);
  }, [vendor.id, marker, onMarkerChange]);

  return (
    <AdvancedMarker
      ref={markerRef}
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
        background={String(vendor.status).toLowerCase() === "active" ? MAP_COLORS.success : MAP_COLORS.warning}
        glyphColor="#fff"
        borderColor="#fff"
        scale={1.1}
      />
    </AdvancedMarker>
  );
}

function AdminVendorLayer({ mappedVendors, onSelect, onDragEnd }) {
  const map = useMap();
  const clusterer = useRef(null);
  const markers = useRef({});

  const refreshCluster = useCallback(() => {
    if (!clusterer.current) return;
    clusterer.current.clearMarkers();
    clusterer.current.addMarkers(Object.values(markers.current));
  }, []);

  const setClusterMarker = useCallback((id, marker) => {
    if (marker) markers.current[id] = marker;
    else delete markers.current[id];
    refreshCluster();
  }, [refreshCluster]);

  useEffect(() => {
    if (!map) return undefined;
    const nextClusterer = new MarkerClusterer({ map, renderer: createBrandClusterRenderer() });
    clusterer.current = nextClusterer;
    refreshCluster();

    return () => {
      nextClusterer.clearMarkers();
      nextClusterer.setMap(null);
      if (clusterer.current === nextClusterer) clusterer.current = null;
    };
  }, [map, refreshCluster]);

  return mappedVendors.map(({ vendor, position }) => (
    <AdminVendorMarker
      key={vendor.id}
      vendor={vendor}
      position={position}
      onSelect={onSelect}
      onDragEnd={onDragEnd}
      onMarkerChange={setClusterMarker}
    />
  ));
}

export default function AdminVendorMap({ vendors, onSelect, onDragEnd }) {
  const { mapped, excluded } = filterAdminMapVendors(vendors);
  const excludedCount = excluded.outsideMelaka + excluded.missingCoordinates;

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
          keyboardShortcuts={false}
          className="h-[min(68vh,620px)] min-h-[420px] w-full"
        >
          <MelakaHighlight />
          <AdminVendorLayer mappedVendors={mapped} onSelect={onSelect} onDragEnd={onDragEnd} />
        </GMap>
      </APIProvider>

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/80 bg-white/95 px-4 py-3 text-xs shadow-md">
        <strong className="block text-sm text-gray-900">Vendor pins</strong>
        <span className="text-gray-500">Drag a pin to adjust its location · {mapped.length} shown in Melaka</span>
      </div>

      {excludedCount > 0 && (
        <div className="absolute bottom-4 left-4 max-w-[min(90%,520px)] rounded-lg border border-amber-200 bg-amber-50/95 px-4 py-2 text-xs text-amber-800 shadow-md">
          {excluded.missingCoordinates > 0 && `${excluded.missingCoordinates} vendor${excluded.missingCoordinates === 1 ? "" : "s"} missing coordinates`}
          {excluded.missingCoordinates > 0 && excluded.outsideMelaka > 0 && " · "}
          {excluded.outsideMelaka > 0 && `${excluded.outsideMelaka} outside Melaka`}
          {" — not shown on this Melaka map."}
        </div>
      )}
    </div>
  );
}
