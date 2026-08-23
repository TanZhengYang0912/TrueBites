import { useEffect, useRef, useState } from "react";
import { formatPhotonAddress, photonSearchUrl } from "../../lib/addressSearch";

export default function AddressAutocomplete({ value, onChange, error, disabled = false }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function handleInput(event) {
    const nextValue = event.target.value;
    const sequence = ++requestSeq.current;
    onChange(nextValue);
    clearTimeout(debounceRef.current);
    const query = nextValue.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(photonSearchUrl(query));
        if (!response.ok) throw new Error("Address search failed");
        const payload = await response.json();
        if (sequence !== requestSeq.current) return;
        setSuggestions(payload.features || []);
        setOpen(true);
      } catch {
        if (sequence === requestSeq.current) {
          setSuggestions([]);
          setOpen(true);
        }
      } finally {
        if (sequence === requestSeq.current) setSearching(false);
      }
    }, 300);
  }

  function pick(feature) {
    const label = formatPhotonAddress(feature);
    if (!label) return;
    onChange(label);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        name="location_text"
        type="text"
        value={value}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        disabled={disabled}
        placeholder="Start typing a Melaka address…"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="suggestion-address-options"
        className={`mt-2 min-h-11 w-full rounded border bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-forest focus:ring-2 focus:ring-forest/10 ${error ? "border-red-400" : "border-sand"}`}
      />
      {!disabled && (
        <span className="mt-1 block text-xs font-normal text-muted">
          {searching ? "Finding addresses…" : "Choose a result to fill the complete address."}
        </span>
      )}
      {open && (
        <ul id="suggestion-address-options" role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded border border-sand bg-white p-1 shadow-xl">
          {suggestions.length > 0 ? suggestions.map((feature, index) => {
            const label = formatPhotonAddress(feature);
            if (!label) return null;
            return (
              <li key={`${label}-${index}`} role="option">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pick(feature)} className="w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-sand/40 focus:bg-sand/40 focus:outline-none">
                  {label}
                </button>
              </li>
            );
          }) : (
            <li className="px-3 py-2 text-sm text-muted">No matching Melaka address found. You can enter it manually.</li>
          )}
        </ul>
      )}
      {error && <span className="mt-1 block text-xs font-normal text-red-600">{error}</span>}
    </div>
  );
}
