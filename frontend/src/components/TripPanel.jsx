import { useState } from "react";
import { GripVertical, X, Sparkles, Route, Clock, Plus, ExternalLink, Bike, Bus, Car, Footprints } from "lucide-react";
import LocationInput from "./LocationInput";
import TransitDetails from "./TransitDetails";
import RouteOptions from "./RouteOptions";
import { rowsFor } from "../lib/tripStops";
import { MAP_COLORS } from "../lib/mapColors";
import { vendorGallery, priceLabel } from "../lib/vendorDisplay";
import { buildGoogleMapsUrl } from "../lib/googleMapsHandoff";
import { stopStatusPresentation } from "../lib/tripOptimization";
import { sanitizeGoogleAttributions } from "../lib/customPlaces";

const NAV_MODES = [
  { mode: "DRIVING",     label: "Car",        Icon: Car },
  // lucide has no motorcycle; Bike is the closest. Unselected rail buttons are
  // icon-only, so the real name lives in aria-label and title.
  { mode: "TWO_WHEELER", label: "Motorcycle", Icon: Bike },
  { mode: "TRANSIT",     label: "Transit",    Icon: Bus },
  { mode: "WALKING",     label: "Walking",    Icon: Footprints },
];

const OUTLINE_BTN =
  "mb-1.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-sand bg-white px-3 text-[13px] font-medium text-forest no-underline";

const ICON_BTN = "grid size-11 shrink-0 place-items-center text-muted";

const STATUS_TONE_CLASS = {
  neutral: "text-muted",
  success: "text-success",
  warning: "text-[#B56A18]",
  danger: "text-terracotta",
  muted: "text-muted",
};

// Multi-stop trip planner. Every entry (including "Your location") is a normal
// draggable stop — nothing is locked as start or end. "Nearby to add" always
// surfaces vendors near "Your location" (never the last stop) that aren't in
// the trip yet, one tap to add.
export default function TripPanel({
  trip, draftStops, summary, routeError, loading,
  onReorder, onClear, onRemove,
  onAddDraft, onResolveDraft, onRetargetStop, onUseGps, focusDraftId,
  travelMode, onTravelMode,
  routeOptions, routeIndex, onSelectRoute,
  transitLegs,
  onSuggestBestOrder,
  onGoogleMapsOpen,
  transitScopeMessage,
  tripAtLimit,
  bestOrderDisabled = false,
  optimizationLoading,
  optimizationComparison,
  arrivalRows = [],
  routeWarnings = [],
  routeCopyrights,
  locationBias,
}) {
  const [dragId, setDragId] = useState(null);
  const rows = rowsFor(trip, draftStops);
  const arrivalsById = new Map(arrivalRows.map((row) => [row.stopId, row]));
  const customAttributions = [...new Map(
    sanitizeGoogleAttributions(trip.flatMap((stop) => stop.attributions || []))
      .map((attribution) => [`${attribution.provider}|${attribution.providerURI || ""}`, attribution]),
  ).values()];

  function handleDrop(targetId, targetIsDraft) {
    if (!dragId || targetIsDraft || dragId === targetId) return;
    const from = trip.findIndex((stop) => stop.id === dragId);
    const to = trip.findIndex((stop) => stop.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...trip];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    onReorder(next);
  }

  const gmaps = buildGoogleMapsUrl(trip, travelMode);

  return (
    <>
      {trip.length > 1 && (
        <div className="mb-2.5 mt-1 text-[11px] text-muted">Drag stops to reorder</div>
      )}

      <ol className="m-0 list-none p-0">
        {rows.map((row) => {
          const isAnchor = row.type === "anchor";
          const editable = row.draft || row.type !== "vendor";
          const tripIndex = trip.findIndex((stop) => stop.id === row.id);
          const previousStop = trip[tripIndex - 1];
          const arrival = arrivalsById.get(row.id);
          const routeDistance = arrival?.legDistance
            ? `${arrival.legDistance} ${arrival.fromStopId === previousStop?.id ? "from previous stop" : "from start"}`
            : null;
          const stopPrice = row.vendor ? priceLabel(row.vendor) : row.priceLabel;
          const metadata = [routeDistance, stopPrice].filter(Boolean).join(" · ");
          const statusPresentation = stopStatusPresentation(row.vendor, arrival);
          return (
            <li key={row.id}>
              <div
                data-stop-id={row.id}
                data-stop-type={row.type}
                draggable={!row.draft}
                onDragStart={() => setDragId(row.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(row.id, row.draft)}
                className={[
                  "mb-1.5 flex items-center gap-2 rounded-[10px] border px-1.5 py-1.5",
                  row.draft ? "" : "cursor-grab",
                  dragId === row.id ? "bg-chalk" : isAnchor ? "bg-[#EAF6EE]" : "bg-transparent",
                  isAnchor ? "border-[#CDE9D6]" : "border-sand",
                ].join(" ")}
              >
                <GripVertical size={14} color={MAP_COLORS.muted} className={row.draft ? "shrink-0 opacity-30" : "shrink-0"} />
                <span className={isAnchor
                  ? "flex size-4.5 shrink-0 items-center justify-center rounded-full bg-success text-[10.5px] text-white"
                  : "flex size-4.5 shrink-0 items-center justify-center rounded-full bg-forest text-[10.5px] text-white"}
                >{row.number}</span>

                {editable ? (
                  <span className="min-w-0 flex-1">
                    {isAnchor && <span className="mb-0.5 block text-[10.5px] font-semibold text-success">Search area</span>}
                    <LocationInput
                      key={`${row.id}:${row.name || ""}`}
                      defaultValue={row.name || ""}
                      autoFocus={row.id === focusDraftId}
                      placeholder={isAnchor ? "Choose search area…" : "Search a place…"}
                      biasCenter={locationBias}
                      onSelect={(place) => row.draft ? onResolveDraft(row.id, place) : onRetargetStop(row.id, place)}
                      onGps={() => onUseGps(row.id, row.draft)}
                    />
                    {metadata && <span className="mt-0.5 block text-[11px] text-muted">{metadata}</span>}
                    {statusPresentation && (
                      <span className={`mt-0.5 block text-[11px] ${STATUS_TONE_CLASS[statusPresentation.tone] || STATUS_TONE_CLASS.neutral}`}>
                        {statusPresentation.text}
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                    {row.vendor && <img src={vendorGallery(row.vendor)[0]} alt="" className="size-8.5 shrink-0 rounded-full object-cover" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{row.name}</span>
                      {metadata && <span className="block text-[11px] text-muted">{metadata}</span>}
                      {statusPresentation && (
                        <span className={`block text-[11px] ${STATUS_TONE_CLASS[statusPresentation.tone] || STATUS_TONE_CLASS.neutral}`}>
                          {statusPresentation.text}
                        </span>
                      )}
                    </span>
                  </>
                )}

                {!isAnchor && (
                  <button onClick={() => onRemove(row.id, row.draft)} aria-label="Remove stop" className={ICON_BTN}>
                    <X size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <button
        onClick={onAddDraft}
        disabled={tripAtLimit}
        title={tripAtLimit ? "Trip limit reached (27 stops)" : undefined}
        className="flex min-h-11 items-center gap-1.5 text-[12.5px] font-medium text-terracotta disabled:cursor-not-allowed disabled:text-muted"
      >
        <Plus size={13} /> Add stop
      </button>

      {routeError && (
        <p role="alert" className="my-2 rounded-lg border border-terracotta/40 bg-terracotta/10 px-3 py-2 text-[12.5px] text-terracotta">{routeError}</p>
      )}

      {transitScopeMessage && (
        <p role="note" className="my-2 text-[10.5px] leading-relaxed text-muted">{transitScopeMessage}</p>
      )}

      {loading && <div className="my-2.5 text-xs text-muted">Calculating route…</div>}

      {/* Route summary tiles */}
      {summary && !loading && (
        <div className="my-3 grid grid-cols-2 gap-2">
          <StatTile icon={<Route size={13} color={MAP_COLORS.terracotta} />} value={summary.distance} label="Total Distance" />
          <StatTile icon={<Clock size={13} color={MAP_COLORS.terracotta} />} value={summary.duration} label="Est. Duration" />
        </div>
      )}

      {(optimizationLoading || optimizationComparison) && (
        <div aria-live="polite" role="status" className={`mb-2 text-center text-[11.5px] ${optimizationComparison?.tone === "danger" ? "text-terracotta" : "text-forest"}`}>
          {optimizationLoading ? "Finding best order…" : optimizationComparison.message}
        </div>
      )}

      {trip.length >= 2 && (
        <div className="mb-2">
          <button
            onClick={onSuggestBestOrder}
            disabled={optimizationLoading || bestOrderDisabled || Boolean(routeError) || travelMode === "TRANSIT"}
            title={travelMode === "TRANSIT" ? "Best order is unavailable for Transit." : undefined}
            className={`${OUTLINE_BTN} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Sparkles size={14} /> {optimizationLoading ? "Finding best order…" : "Suggest Best Order"}
          </button>
          <p className="m-0 text-center text-[10.5px] leading-relaxed text-muted">Your first and final stops stay fixed. We’ll reorder the stops in between.</p>
        </div>
      )}

      {/* Travel mode. Always visible: it used to hide behind a "Start
          Navigation" toggle, which made the mode unreachable until you found
          the button. Selected mode expands to show its label; the rest stay
          icon-only, with the name on aria-label and title. */}
      {trip.length >= 2 && (
      <div
        role="radiogroup"
        aria-label="Travel mode"
        className="my-2 flex items-center gap-1 rounded-full border border-sand bg-chalk p-1"
      >
        {NAV_MODES.map(({ mode, label, Icon }) => {
          const active = travelMode === mode;
          return (
            <button
              key={mode}
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              onClick={() => onTravelMode(mode)}
              className={active
                ? "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-forest px-3 text-[12.5px] font-semibold text-white transition-all motion-reduce:transition-none"
                : "flex size-11 min-h-11 shrink-0 items-center justify-center rounded-full text-muted transition-all hover:text-forest motion-reduce:transition-none"}
            >
              <Icon size={17} strokeWidth={1.8} />
              {active && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </div>
      )}

      {travelMode === "TRANSIT" && trip.length >= 2 && <TransitDetails legs={transitLegs} />}
      {travelMode === "DRIVING" && trip.length >= 2 && (
        <RouteOptions routes={routeOptions} selectedIndex={routeIndex} onSelect={onSelectRoute} />
      )}

      {/* Hands off to Google Maps for real turn-by-turn navigation — we don't
          build in-app navigation ourselves. */}
      {gmaps && (
        <a
          href={gmaps.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (gmaps.truncated) onGoogleMapsOpen?.(gmaps.remainingCount);
          }}
          className={`${OUTLINE_BTN} mb-0 mt-2`}
        >
          <ExternalLink size={14} /> Open in Google Maps
        </a>
      )}
      {gmaps && travelMode !== "TRANSIT" && (
        <div className="mt-1 text-center text-[10.5px] text-muted">
          {gmaps.truncated
            ? <>Google Maps will open stops 1–7 only. The remaining {gmaps.remainingCount} stops will stay in your TrueBites trip.</>
            : "Google Maps can open up to 7 stops at a time."}
        </div>
      )}

      <div id="google-place-attributions" className="mt-1 text-center text-xs leading-relaxed text-muted" />
      {customAttributions.length > 0 && (
        <div className="mt-1 text-center text-xs leading-relaxed text-muted">
          Place data: {customAttributions.map((attribution, index) => (
            <span key={`${attribution.provider}|${attribution.providerURI || ""}`}>
              {index > 0 ? ", " : ""}
              {attribution.providerURI ? (
                <a href={attribution.providerURI} target="_blank" rel="noopener noreferrer" className="underline">
                  {attribution.provider}
                </a>
              ) : attribution.provider}
            </span>
          ))}
        </div>
      )}
      {routeCopyrights && (
        <div className="mt-1 text-center text-[10px] leading-relaxed text-muted">{routeCopyrights}</div>
      )}
      {routeWarnings.map((warning) => (
        <div key={warning} role="note" className="mt-1 text-center text-[9.5px] leading-relaxed text-muted">
          {warning}
        </div>
      ))}

      {trip.length > 0 && (
        <button
          onClick={onClear}
          className="mt-2.5 block min-h-11 w-full text-center text-xs text-muted"
        >
          Clear stops
        </button>
      )}
    </>
  );
}

function StatTile({ icon, value, label }) {
  return (
    <div className="rounded-[10px] bg-chalk px-2.5 py-2">
      <div className="mb-1">{icon}</div>
      <div className="text-sm font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
    </div>
  );
}
