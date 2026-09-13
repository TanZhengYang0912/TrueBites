import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { LocateFixed } from "lucide-react";
import {
  createLatestSelectionGate,
  fetchGooglePlaceDetails,
} from "../lib/customPlaces";

export default function LocationInput({
  onSelect,
  onGps,
  defaultValue = "",
  placeholder = "Search a place…",
  autoFocus = false,
  biasCenter = null,
}) {
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const pickedRef = useRef(false);
  const selectionGateRef = useRef(createLatestSelectionGate());
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;
    let active = true;
    const lat = Number(biasCenter?.lat);
    const lng = Number(biasCenter?.lng);
    const hasBias = Number.isFinite(lat) && Number.isFinite(lng);
    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "place_id", "formatted_address"],
      componentRestrictions: { country: "my" },
      ...(hasBias ? {
        bounds: { north: lat + 0.35, south: lat - 0.35, east: lng + 0.35, west: lng - 0.35 },
      } : {}),
      strictBounds: false,
    });
    const listener = autocomplete.addListener("place_changed", async () => {
      const place = autocomplete.getPlace();
      const location = place.geometry?.location;
      if (!location) return;
      pickedRef.current = true;
      const selectionId = selectionGateRef.current.next();
      const basic = {
        lat: location.lat(),
        lng: location.lng(),
        label: place.formatted_address || place.name || inputRef.current.value,
        ...(place.place_id ? { placeId: place.place_id } : {}),
        ...(place.formatted_address ? { address: place.formatted_address } : {}),
      };
      if (!place.place_id) {
        onSelectRef.current?.(basic);
        return;
      }
      try {
        const details = await fetchGooglePlaceDetails(placesLib, place.place_id);
        if (!active || !selectionGateRef.current.isCurrent(selectionId)) return;
        onSelectRef.current?.({ ...basic, ...details, label: details.label || basic.label });
      } catch {
        if (active && selectionGateRef.current.isCurrent(selectionId)) onSelectRef.current?.(basic);
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [placesLib, biasCenter?.lat, biasCenter?.lng]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function revertIfUnselected() {
    if (!pickedRef.current && inputRef.current) inputRef.current.value = defaultValue;
    pickedRef.current = false;
  }

  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        onFocus={() => { pickedRef.current = false; }}
        onBlur={revertIfUnselected}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            revertIfUnselected();
            inputRef.current?.blur();
          }
        }}
        className="min-h-11 w-full rounded-lg border border-sand bg-white px-2.5 pr-11 text-[13px] text-ink outline-none focus:border-forest"
      />
      {onGps && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onGps}
          aria-label="Use my current location for this stop"
          title="Use my current location"
          className="absolute right-0 grid size-11 place-items-center text-success"
        >
          <LocateFixed size={15} />
        </button>
      )}
    </span>
  );
}
