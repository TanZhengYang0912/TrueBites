import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { LocateFixed } from "lucide-react";

export default function LocationInput({
  onSelect,
  onGps,
  defaultValue = "",
  placeholder = "Search a place…",
  autoFocus = false,
}) {
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const pickedRef = useRef(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;
    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "formatted_address"],
      componentRestrictions: { country: "my" },
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const location = place.geometry?.location;
      if (!location) return;
      pickedRef.current = true;
      onSelectRef.current?.({
        lat: location.lat(),
        lng: location.lng(),
        label: place.formatted_address || place.name || inputRef.current.value,
      });
    });
    return () => listener.remove();
  }, [placesLib]);

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
