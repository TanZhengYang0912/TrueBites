import { useEffect } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { fetchGooglePlaceDetails } from "../lib/customPlaces";

// Google permits Place IDs to be stored indefinitely, while display details
// should be refreshed. This component has no UI; it hydrates those optional
// details whenever a browser-local trip is restored.
export default function CustomPlaceDetailsLoader({ stops, onDetails }) {
  const placesLib = useMapsLibrary("places");
  const placeKey = (stops || [])
    .filter((stop) => stop.source === "custom" && stop.placeId)
    .map((stop) => `${stop.id}:${stop.placeId}`)
    .join("|");

  useEffect(() => {
    if (!placesLib || !placeKey) return;
    let active = true;
    const stopsByPlaceId = new Map();
    (stops || [])
      .filter((stop) => stop.source === "custom" && stop.placeId)
      .forEach((stop) => {
        const matchingStops = stopsByPlaceId.get(stop.placeId) || [];
        matchingStops.push(stop);
        stopsByPlaceId.set(stop.placeId, matchingStops);
      });

    Promise.allSettled([...stopsByPlaceId.entries()].map(async ([placeId, matchingStops]) => {
      const details = await fetchGooglePlaceDetails(placesLib, placeId);
      if (!active) return;
      matchingStops.forEach((stop) => onDetails?.(stop.id, stop.placeId, details));
    }));

    return () => { active = false; };
    // placeKey intentionally excludes refreshed display fields so hydration
    // does not repeat after onDetails updates the in-memory stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib, placeKey, onDetails]);

  return null;
}
