import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { createLatestSelectionGate, fetchGooglePlaceDetails } from "../lib/customPlaces";

// Google Places Autocomplete box for typing a start location manually,
// instead of relying on GPS. Restricted to Malaysia to match app coverage.
export default function LocationInput({ onSelect, placeholder = "Search start address…", biasCenter = null }) {
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const lat = Number(biasCenter?.lat);
    const lng = Number(biasCenter?.lng);
    const hasBias = Number.isFinite(lat) && Number.isFinite(lng);
    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "place_id", "formatted_address"],
      componentRestrictions: { country: "my" },
      ...(hasBias ? {
        bounds: {
          north: lat + 0.35,
          south: lat - 0.35,
          east: lng + 0.35,
          west: lng - 0.35,
        },
      } : {}),
      strictBounds: false,
    });

    let active = true;
    const selectionGate = createLatestSelectionGate();
    const listener = autocomplete.addListener("place_changed", async () => {
      const selectionId = selectionGate.next();
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      const basic = {
        lat: loc.lat(),
        lng: loc.lng(),
        label: place.name || inputRef.current?.value,
        ...(place.place_id ? { placeId: place.place_id } : {}),
        ...(place.formatted_address ? { address: place.formatted_address } : {}),
      };

      if (!place.place_id) {
        if (active && selectionGate.isCurrent(selectionId)) onSelect(basic);
        return;
      }

      try {
        const details = await fetchGooglePlaceDetails(placesLib, place.place_id);
        if (active && selectionGate.isCurrent(selectionId)) onSelect({ ...basic, ...details });
      } catch {
        if (active && selectionGate.isCurrent(selectionId)) onSelect(basic);
      }
    });

    return () => {
      active = false;
      listener.remove();
    };
  }, [placesLib, onSelect, biasCenter?.lat, biasCenter?.lng]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder}
      className="mb-2 min-h-11 w-full rounded-lg border border-sand bg-chalk px-2.5 text-[13px] text-ink outline-none focus:border-forest"
    />
  );
}
