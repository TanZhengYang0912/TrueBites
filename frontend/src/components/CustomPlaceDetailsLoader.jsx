import { useEffect } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { fetchGooglePlaceDetails } from "../lib/customPlaces";

// Google Place IDs may be stored, while display fields are refreshed. This
// component deliberately renders nothing and only hydrates browser-local stops.
export default function CustomPlaceDetailsLoader({ stops, onDetails }) {
  const placesLib = useMapsLibrary("places");
  const placeKey = (stops || [])
    .filter((stop) => stop.type === "custom" && stop.placeId)
    .map((stop) => `${stop.id}:${stop.placeId}`)
    .join("|");

  useEffect(() => {
    if (!placesLib || !placeKey) return;
    let active = true;
    const stopsByPlaceId = new Map();
    (stops || [])
      .filter((stop) => stop.type === "custom" && stop.placeId)
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
    // Display-field updates deliberately do not change this effect identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib, placeKey, onDetails]);

  return null;
}
