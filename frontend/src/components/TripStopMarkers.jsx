import { useMemo, useState } from "react";
import { AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import { groupStopsByPosition, nearlySamePlace, rowsFor } from "../lib/tripStops";
import { HawkerStallPin } from "./VendorMarkers";

export default function TripStopMarkers({ trip, draftStops, userPos }) {
  const [openIndex, setOpenIndex] = useState(null);
  const numberedStops = useMemo(
    () => rowsFor(trip, draftStops).filter((row) => !row.draft),
    [trip, draftStops],
  );
  const groups = useMemo(() => groupStopsByPosition(numberedStops), [numberedStops]);
  const userIsAStop = Boolean(userPos) && groups.some((group) => nearlySamePlace(group, userPos));

  return (
    <>
      {groups.map((group, index) => (
        <AdvancedMarker
          key={group.stops.map((stop) => stop.id).join("+")}
          position={{ lat: group.lat, lng: group.lng }}
          title={group.stops.map((stop) => `${stop.number}. ${stop.name}`).join(", ")}
          zIndex={1000}
          onClick={() => setOpenIndex((current) => current === index ? null : index)}
        >
          <HawkerStallPin stopNum={group.stops.map((stop) => stop.number).join(" · ")} />
        </AdvancedMarker>
      ))}

      {openIndex !== null && groups[openIndex] && (
        <InfoWindow
          position={{ lat: groups[openIndex].lat, lng: groups[openIndex].lng }}
          onCloseClick={() => setOpenIndex(null)}
        >
          <ol className="m-0 list-none p-0 font-body text-[13px] text-ink">
            {groups[openIndex].stops.map((stop) => (
              <li key={stop.id} className="flex items-center gap-2 py-0.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-terracotta text-[10.5px] font-bold text-white">{stop.number}</span>
                <span className="truncate">{stop.name}</span>
              </li>
            ))}
          </ol>
        </InfoWindow>
      )}

      {userPos && !userIsAStop && (
        <AdvancedMarker position={userPos} title="You are here">
          <div className="user-loc-dot" />
        </AdvancedMarker>
      )}
    </>
  );
}
