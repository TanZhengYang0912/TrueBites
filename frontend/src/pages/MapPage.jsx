import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { APIProvider, Map as GMap, useMap } from "@vis.gl/react-google-maps";
import { Maximize2, Minimize2 } from "lucide-react";
import { getRestaurants } from "../api";
import { useSession } from "../lib/SessionContext";
import { getBookmarks, getFolders, addBookmark, removeBookmark, createFolder } from "../api/engagement";
import VendorMarkers from "../components/VendorMarkers";
import MelakaHighlight from "../components/MelakaHighlight";
import TripPanel from "../components/TripPanel";
import MapPanel from "../components/MapPanel";
import VendorPanel from "../components/VendorPanel";
import DirectionsRenderer from "../components/DirectionsRenderer";
import CustomPlaceDetailsLoader from "../components/CustomPlaceDetailsLoader";
import TransitLayer from "../components/TransitLayer";
import Dashboard from "../components/Dashboard";
import DiscoveryHeader from "../components/discovery/DiscoveryHeader";
import GuestPrompt from "../components/discovery/GuestPrompt";
import VendorDetailModal from "../components/discovery/VendorDetailModal";
import FolderPickerModal from "../components/engagement/FolderPickerModal";
import Toast from "../components/engagement/Toast";
import { useToast, sleep } from "../lib/useToast";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";
import { loadTrip, saveTrip, tripOwner } from "../lib/tripStorage";
import { reportSavedCount, useSavedCount } from "../lib/savedCount";
import { getCachedBookmarks, getCachedFolders, setCachedBookmarks, setCachedFolders } from "../lib/bookmarksCache";
import { loadPanelTab, savePanelTab } from "../lib/panelPrefs";
import {
  clearMapOrigin,
  loadMapOrigin,
  saveMapOrigin,
  subscribeMapOriginClear,
} from "../lib/mapOriginSession";
import { MAP_COLORS } from "../lib/mapColors";
import { selectVisibleVendors, haversineKm } from "../lib/mapVisibility";
import {
  DEFAULT_VENDOR_FILTERS,
  matchesFilters,
  sortVendors,
} from "../lib/vendorFilters";
import { shortPlaceName } from "../lib/placeName";
import { customStopsForMap, customStopFromPlace } from "../lib/customPlaces";
import { customerSession } from "../lib/roles";
import {
  EMPTY_ROUTE_SUMMARY,
  TRIP_LIMIT_ADD_MESSAGE,
  getDirectionsErrorMessage,
  getRouteConstraint,
  isTripAtLimit,
  selectRoutingStops,
  formatTransitScopeMessage,
} from "../lib/tripRoutingPolicy";
import {
  applyWaypointOrder,
  buildArrivalTimeline,
  buildOptimizationComparison,
  matchesTripIdentity,
  tripFingerprint,
} from "../lib/tripOptimization";

const MELAKA_CENTER = { lat: 2.1896, lng: 102.2501 };
const API_KEY = import.meta.env.VITE_MAPS_BROWSER_KEY;
const MAP_ID = import.meta.env.VITE_MAP_ID || "DEMO_MAP_ID";

function FocusOnVendor({ vendor }) {
  const map = useMap();
  useEffect(() => {
    if (map && vendor) {
      map.panTo({ lat: vendor.latitude, lng: vendor.longitude });
      map.setZoom(16);
    }
  }, [map, vendor]);
  return null;
}

function FocusOnUser({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (map && pos) {
      map.panTo(pos);
      map.setZoom(14);
    }
  }, [map, pos]);
  return null;
}

function FocusOnTripStop({ stop }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !stop) return;
    map.panTo({ lat: stop.lat, lng: stop.lng });
    map.setZoom(16);
  }, [map, stop]);
  return null;
}

export default function MapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  // One component serves both addresses: /map is the pin map, /discover (and
  // anything else that routes here) is the list.
  const view = location.pathname === "/map" ? "map" : "dashboard";           // "dashboard" | "map"
  const focusVendorId = searchParams.get("vendor");
  // Consumed once by the Dashboard's detail modal, then dropped so a refresh
  // or a back-navigation doesn't reopen it.
  function clearFocusVendor() {
    const next = new URLSearchParams(searchParams);
    next.delete("vendor");
    setSearchParams(next, { replace: true });
  }
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);
  const owner = tripOwner(authSession);
  const [bookmarkRows, setBookmarkRows] = useState(() => getCachedBookmarks() ?? []); // {vendor_id, folder_id, folder} from the server
  const [folders, setFolders] = useState(() => getCachedFolders() ?? []);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null); // vendor awaiting a folder pick
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const [detailVendor, setDetailVendor] = useState(null);
  const bookmarks = new Set(bookmarkRows.map((r) => r.vendor_id));
  const savedCount = useSavedCount(false);
  const [focusVendor, setFocusVendor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [openId, setOpenId] = useState(null); // vendor id whose InfoWindow is open
  const [initialMapOrigin] = useState(() => loadMapOrigin());
  const [userPos, setUserPos] = useState(initialMapOrigin);
  // Kept separate from userPos because the map may fall back to Melaka centre
  // after a denied/failed geolocation request. That fallback is useful for the
  // camera, but it must never masquerade as the user's origin.
  const [distanceOrigin, setDistanceOrigin] = useState(initialMapOrigin);
  const [locateTarget, setLocateTarget] = useState(null);
  const [focusTripStop, setFocusTripStop] = useState(null);
  const [radiusKm, setRadiusKm] = useState(2); // drives the "Nearby to add" list and its displayed radius
  const [filters, setFilters] = useState(DEFAULT_VENDOR_FILTERS);
  const updateFilters = (partial) => setFilters((current) => ({ ...current, ...partial }));
  const clearFilters = () => setFilters(DEFAULT_VENDOR_FILTERS);
  // Defaults on so arriving from the Dashboard's Map tab isn't an empty map.
  const [showAllVendors, setShowAllVendors] = useState(true);
  const [tripCollapsed, setTripCollapsed] = useState(false);
  const [panelTab, setPanelTab] = useState(loadPanelTab);
  function changeTab(tab) { setPanelTab(tab); savePanelTab(tab); }
  const [mapFullscreen, setMapFullscreen] = useState(false);

  // Guest trips and account trips are browser-local but isolated from each
  // other. Hydration waits for Supabase to resolve the current identity so a
  // logged-in trip can never be mistaken for a guest trip during startup.
  const [trip, setTrip] = useState([]);              // unified draggable stops
  const [travelMode, setTravelMode] = useState(null);   // null | "DRIVING" | "TWO_WHEELER" | "TRANSIT" | "WALKING"
  const [hydratedOwner, setHydratedOwner] = useState(null);
  const [dirSummary, setDirSummary] = useState(null);
  const [dirError, setDirError] = useState(null);
  const [routeIndex, setRouteIndex] = useState(0);       // selected alt route (DRIVING)
  const [routeOptions, setRouteOptions] = useState([]);  // alt routes + toll flags (DRIVING)
  const [transitLegs, setTransitLegs] = useState([]);    // itinerary legs (TRANSIT)
  const [optimizationRequest, setOptimizationRequest] = useState(null);
  const [optimizationComparison, setOptimizationComparison] = useState(null);
  const [arrivalRows, setArrivalRows] = useState([]);
  const [routeWarnings, setRouteWarnings] = useState([]);
  const [routeCopyrights, setRouteCopyrights] = useState("");
  const optimizationIdRef = useRef(0);
  const [isDark, setIsDark] = useState(false);
  const [toast, notify] = useToast();
  const [mapError, setMapError] = useState("");
  const tripAtLimit = isTripAtLimit(trip.length);
  // Keep the Transit start/final pair referentially stable between unrelated
  // renders so DirectionsRenderer does not repeat the same Google request.
  const routingStops = useMemo(
    () => selectRoutingStops(trip, travelMode),
    [trip, travelMode],
  );
  const routeConstraint = getRouteConstraint(travelMode, trip.length);
  const routeMessage = routeConstraint?.message || getDirectionsErrorMessage(dirError, trip.length);
  const transitScopeMessage = travelMode === "TRANSIT"
    ? formatTransitScopeMessage(trip, routingStops)
    : null;
  const displayedSummary = routeConstraint ? EMPTY_ROUTE_SUMMARY : travelMode ? dirSummary : null;

  useLayoutEffect(() => {
    if (sessionLoading) return;
    const stored = loadTrip(owner);
    setTrip(stored?.stops || []);
    setTravelMode(stored?.travelMode || null);
    setDirSummary(null);
    setDirError(null);
    setRouteOptions([]);
    setTransitLegs([]);
    setOptimizationRequest(null);
    setOptimizationComparison(null);
    setArrivalRows([]);
    setRouteWarnings([]);
    setRouteCopyrights("");
    optimizationIdRef.current += 1;
    setHydratedOwner(owner);
  }, [owner, sessionLoading]);

  useEffect(() => subscribeMapOriginClear(() => {
    setUserPos(null);
    setDistanceOrigin(null);
    setLocateTarget(null);
    setTrip((current) => current.filter((stop) => !stop.isMe));
  }), []);

  useEffect(() => {
    const mapAuthFailure = () => {
      setMapError("Google Maps could not be authenticated. Please check the browser key, Maps JavaScript API, and billing settings.");
    };
    const detectMapFailure = () => {
      const bodyText = document.body?.innerText || "";
      if (/This page can't load Google Maps correctly|Do you own this website\?|BillingNotEnabledMapError|InvalidKeyMapError|ApiNotActivatedMapError/.test(bodyText)) {
        mapAuthFailure();
      }
    };
    const previousAuthFailure = window.gm_authFailure;
    const onWindowError = (event) => {
      const message = String(event?.message || event?.error?.message || "");
      if (/BillingNotEnabledMapError|InvalidKeyMapError|ApiNotActivatedMapError/.test(message)) {
        mapAuthFailure();
      }
    };
    const observer = new MutationObserver(detectMapFailure);

    window.gm_authFailure = mapAuthFailure;
    window.addEventListener("error", onWindowError);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    detectMapFailure();
    return () => {
      window.removeEventListener("error", onWindowError);
      observer.disconnect();
      if (window.gm_authFailure === mapAuthFailure) window.gm_authFailure = previousAuthFailure;
    };
  }, []);

  // Load vendors (Supabase, sorted from Melaka centre as a default reference).
  // Failures are surfaced two ways: a toast (transient) and vendorsError
  // (persistent — the empty-result grid otherwise looked identical to a
  // genuinely-empty result, with no way to tell "nothing matched" from
  // "the fetch failed" or retry without a full page reload).
  const [vendorsError, setVendorsError] = useState("");
  function loadVendors() {
    setVendorsLoading(true);
    setVendorsError("");
    getRestaurants(MELAKA_CENTER.lat, MELAKA_CENTER.lng)
      .then(setVendors)
      .catch((e) => {
        console.error("failed to load vendors:", e.message);
        setVendorsError(e.message || "Couldn't load vendors. Check your connection and try again.");
        notify("Couldn't load vendors. Check your connection and try again.", true);
      })
      .finally(() => setVendorsLoading(false));
  }
  useEffect(() => {
    loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ?vendor=... in the URL to automatically select and focus a vendor
  useEffect(() => {
    const targetId = searchParams.get("vendor");
    if (targetId && vendors.length > 0) {
      const v = vendors.find(vv => vv.id === targetId);
      if (v) {
        setSelected(v);
        setFocusVendor(v);
        setOpenId(v.id);
        // Clear the URL parameter so it doesn't get stuck open if the user refreshes
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("vendor");
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [vendors, searchParams, setSearchParams]);

  // Persist the trip on every change (id/name/lat/lng/isMe/source only — see
  // lib/tripStorage.js for why the embedded `vendor` snapshot isn't saved).
  useEffect(() => {
    if (hydratedOwner !== owner) return;
    saveTrip(trip, travelMode, owner);
  }, [trip, travelMode, owner, hydratedOwner]);

  // A trip restored from storage carries vendor stops with no `vendor` object
  // (it's never persisted). Re-attach it by id once the vendor list loads.
  useEffect(() => {
    if (!vendors.length) return;
    setTrip((current) => {
      let changed = false;
      const next = current.map((s) => {
        if (s.isMe || s.vendor) return s;
        const v = vendors.find((vv) => vv.id === s.id);
        if (!v) return s;
        changed = true;
        return { ...s, vendor: v };
      });
      return changed ? next : current;
    });
  }, [vendors]);

  // Bookmarks are server-backed and auth-gated — an anonymous browser sees
  // none, and any local state is dropped the moment the session disappears.
  useEffect(() => {
    if (!session && !ENGAGEMENT_TEST_MODE) { setBookmarkRows([]); setFolders([]); return; }
    refreshBookmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function refreshBookmarks() {
    getFolders().then((f) => { setFolders(f.folders); setCachedFolders(f.folders); }).catch((e) => console.error("failed to load folders:", e.message));
    getBookmarks().then((b) => { setBookmarkRows(b.bookmarks); setCachedBookmarks(b.bookmarks); reportSavedCount(b.bookmarks.length); }).catch((e) => console.error("failed to load bookmarks:", e.message));
  }

  // Each stop is a normal draggable entry — the user's location too.
  const vendorStop = (v) => ({ id: v.id, name: v.name, lat: v.latitude, lng: v.longitude, isMe: false, vendor: v });
  // `pos.label` is present when the origin came from Places Autocomplete, absent
  // for GPS — so a typed origin reads as its address instead of a generic string.
  const meStop = (pos) => ({ id: "__me__", name: pos.label || "Your location", lat: pos.lat, lng: pos.lng, isMe: true });
  function showTripLimit() { notify(TRIP_LIMIT_ADD_MESSAGE, true); }

  function invalidateOptimizationFeedback() {
    optimizationIdRef.current += 1;
    setOptimizationRequest(null);
    setOptimizationComparison(null);
    setArrivalRows([]);
    setRouteWarnings([]);
    setRouteCopyrights("");
  }

  useEffect(() => {
    if (!userPos || hydratedOwner !== owner) return;
    const hasMe = trip.some((s) => s.isMe);
    if (!hasMe && isTripAtLimit(trip.length)) {
      showTripLimit();
      return;
    }
    invalidateOptimizationFeedback();
    setTrip((current) => {
      const currentHasMe = current.some((stop) => stop.isMe);
      if (!currentHasMe) return [meStop(userPos), ...current];
      let changed = false;
      const next = current.map((stop) => {
        if (!stop.isMe) return stop;
        const name = userPos.label || "Your location";
        if (stop.lat === userPos.lat && stop.lng === userPos.lng && stop.name === name) return stop;
        changed = true;
        return { ...stop, lat: userPos.lat, lng: userPos.lng, name };
      });
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos, hydratedOwner, owner, trip.length]);

  function addStop(vendor) {
    if (trip.some((s) => s.id === vendor.id)) return;
    if (isTripAtLimit(trip.length)) { showTripLimit(); return; }
    const list = [...trip, vendorStop(vendor)];
    invalidateOptimizationFeedback();
    setTrip(list);
    notify(`${vendor.name} added to your trip.`);
  }
  // A typed place (not a vendor) — e.g. "pick up a friend on the way".
  function addCustomStop(place) {
    if (isTripAtLimit(trip.length)) { showTripLimit(); return; }
    const stop = customStopFromPlace(`custom-${Date.now()}`, place);
    const list = [...trip, stop];
    invalidateOptimizationFeedback();
    setTrip(list);
    setFocusTripStop(stop);
    notify(`${place.label} added to your trip.`);
  }
  function reorderTrip(newList) { invalidateOptimizationFeedback(); setTrip(newList); }
  function removeStop(id) { invalidateOptimizationFeedback(); setTrip(trip.filter((s) => s.id !== id)); }
  // Re-typing the address of a custom stop already on the trip (vendor stops
  // aren't editable — they're removed and re-added if wrong; "Your location"
  // uses setManualLocation instead, since that also updates userPos/GPS state).
  function editStop(id, place) {
    const updated = customStopFromPlace(id, place);
    const list = trip.map((s) => (s.id === id ? updated : s));
    invalidateOptimizationFeedback();
    setTrip(list);
    setFocusTripStop(updated);
  }

  const refreshCustomStopDetails = useCallback((id, expectedPlaceId, details) => {
    setTrip((current) => current.map((stop) => {
      if (stop.id !== id || stop.source !== "custom" || stop.placeId !== expectedPlaceId) return stop;
      try {
        return customStopFromPlace(id, {
          ...stop,
          ...details,
          label: details.label || stop.name || "Google place",
          lat: details.lat ?? stop.lat,
          lng: details.lng ?? stop.lng,
        });
      } catch {
        return stop;
      }
    }));
  }, []);

  function selectNearby(vendor) {
    setFocusVendor(vendor);
    setSelected(vendor);
    setOpenId(vendor.id);
  }

  // Keeps "Your location" and the chosen transport mode — only the vendor
  // stops (the actual destinations) are cleared, so the user can immediately
  // start building a new trip from where they are without resetting mode/GPS.
  function clearTrip() {
    const list = trip.filter((s) => s.isMe);
    invalidateOptimizationFeedback();
    setTrip(list);
    setDirSummary(null);
    setDirError(null);
    setRouteOptions([]);
    setTransitLegs([]);
  }

  function changeTravelMode(mode) {
    invalidateOptimizationFeedback();
    setTravelMode(mode);
  }

  function optimizationModeLabel(mode) {
    if (mode === "TWO_WHEELER") return "Motorcycle";
    if (mode === "WALKING") return "Walking";
    return "Car";
  }

  function handleSuggestBestOrder() {
    const mode = travelMode || "DRIVING";
    if (mode === "TRANSIT" || getRouteConstraint(mode, trip.length)) return;

    setOptimizationComparison(null);
    if (!travelMode) setTravelMode("DRIVING");
    if (trip.length < 3) {
      optimizationIdRef.current += 1;
      setOptimizationRequest(null);
      setOptimizationComparison(buildOptimizationComparison(
        { meters: 0, seconds: 0 },
        { meters: 0, seconds: 0 },
      ));
      return;
    }

    const id = optimizationIdRef.current + 1;
    optimizationIdRef.current = id;
    setOptimizationRequest({
      id,
      mode,
      tripFingerprint: tripFingerprint(trip, mode),
      stops: trip.map((stop) => ({ ...stop })),
    });
  }

  function handleOptimizationResult(result) {
    if (!optimizationRequest || result.id !== optimizationRequest.id) return;
    if (result.id !== optimizationIdRef.current) return;
    if (result.mode !== optimizationRequest.mode) return;
    if (result.tripFingerprint !== optimizationRequest.tripFingerprint) return;
    if (!matchesTripIdentity(result, trip, result.mode)) return;

    const reordered = applyWaypointOrder(trip, result.waypointOrder);
    if (!reordered) {
      handleOptimizationError(result);
      return;
    }
    setOptimizationRequest(null);
    if (reordered.some((stop, index) => stop !== trip[index])) setTrip(reordered);
    setOptimizationComparison(buildOptimizationComparison(result.baseline, result.optimized));
  }

  function handleOptimizationError(result) {
    if (!optimizationRequest || result.id !== optimizationRequest.id) return;
    if (result.id !== optimizationIdRef.current) return;
    setOptimizationRequest(null);
    notify(`Couldn’t suggest an order for ${optimizationModeLabel(result.mode)}. Your current order was kept.`, true);
  }

  function handleRouteDetails(details, identity) {
    const routeIdentity = details || identity;
    if (routeIdentity && !matchesTripIdentity(routeIdentity, routingStops, travelMode, routeIndex)) return;
    setArrivalRows(details
      ? buildArrivalTimeline(
        routingStops,
        details.legDurationsSeconds,
        new Date(details.calculatedAt),
        details.legDistancesMeters,
      )
      : []);
  }

  function handleRouteWarnings(warnings, identity) {
    if (identity && !matchesTripIdentity(identity, routingStops, travelMode, routeIndex)) return;
    setRouteWarnings(warnings);
  }

  function handleRouteCopyrights(copyrights, identity) {
    if (identity && !matchesTripIdentity(identity, routingStops, travelMode, routeIndex)) return;
    setRouteCopyrights(copyrights);
  }

  // Manual start location typed via Places Autocomplete — same effect as
  // geolocation resolving, just fed a chosen address instead of GPS.
  function setManualLocation(pos) {
    saveMapOrigin(pos);
    setUserPos(pos);
    setDistanceOrigin(pos);
    setLocateTarget(pos);
  }

  // A previously-picked alt route index shouldn't survive a mode switch or a
  // fresh route recalculation — always default back to Google's top pick.
  useEffect(() => {
    setRouteIndex(0);
    setDirError(null);
    setDirSummary(null);
    setRouteOptions([]);
    setTransitLegs([]);
    setArrivalRows([]);
    setRouteWarnings([]);
    setRouteCopyrights("");
  }, [travelMode, trip]);

  useEffect(() => {
    setDirError(null);
    setDirSummary(null);
    setArrivalRows([]);
    setRouteWarnings([]);
    setRouteCopyrights("");
  }, [routeIndex]);

  useEffect(() => {
    if (!routeConstraint) return;
    setRouteOptions([]);
    setTransitLegs([]);
    setArrivalRows([]);
    setRouteWarnings([]);
    setRouteCopyrights("");
  }, [routeConstraint?.code]);

  // Un-saving is a plain delete; saving opens the folder picker (rendered by
  // each view below) so the vendor lands somewhere the user chose.
  function toggleBookmark(id) {
    // Same contract as Dashboard.jsx's requireAuth: explain why, in place,
    // instead of discarding the map the visitor was looking at.
    if (!session && !ENGAGEMENT_TEST_MODE) { setGuestPromptOpen(true); return; }
    if (bookmarks.has(id)) {
      removeBookmark(id)
        .then(() => { refreshBookmarks(); notify("Vendor removed from bookmarks."); })
        .catch((e) => notify(e.message, true));
      return;
    }
    const vendor = vendors.find((v) => v.id === id);
    setPendingSaveVendor(vendor || { id });
  }

  async function confirmSaveBookmark(folderId) {
    await addBookmark(pendingSaveVendor.id, folderId);
    setPendingSaveVendor(null);
    refreshBookmarks();
    notify("Vendor bookmarked!");
  }

  async function createFolderAndSave(name) {
    const { folder } = await createFolder(name);
    notify("Folder created successfully!");
    refreshBookmarks();
    await sleep(1200);
    await confirmSaveBookmark(folder.id);
  }

  // silent=true only records the position (needed to add "Your location" as a
  // trip stop) without moving the camera — used when locating happens as a
  // side effect of picking a vendor, so it doesn't hijack that vendor's focus
  // once geolocation resolves a moment later.
  // Best-effort reverse geocode so the origin stop reads as a real place. Always
  // resolves — a failure returns the bare position and the stop keeps its
  // generic name. Never let this block the stop from being added.
  function labelForPosition(pos) {
    const Geocoder = window.google?.maps?.Geocoder;
    if (!Geocoder) return Promise.resolve(pos);
    return new Promise((resolve) => {
      new Geocoder().geocode({ location: pos }, (results, status) => {
        if (status !== "OK" || !results?.length) { resolve(pos); return; }
        const label = shortPlaceName(results[0]);
        resolve(label ? { ...pos, label } : pos);
      });
    });
  }

  function locateMe(silent = false) {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (!silent) setLocateTarget(pos);
        // Label first, then set userPos once so the [userPos] effect updates the
        // origin once and triggers only one Google route recalculation.
        labelForPosition(pos).then((labelled) => {
          saveMapOrigin(labelled);
          setUserPos(labelled);
          setDistanceOrigin(labelled);
        });
      },
      () => {
        clearMapOrigin();
        setUserPos(null);
        setDistanceOrigin(null);
        if (!silent) {
          setLocateTarget(MELAKA_CENTER);
          notify("Couldn't get your location — showing Melaka centre instead.", true);
        }
      }
    );
  }

  // Centre the map on the user the first time they arrive at /map. This used
  // to run inside the header's Map toggle; with Map as a plain link there is
  // no click handler left to hang it on. Guarded on distanceOrigin so it asks
  // for permission once per session, not on every visit.
  useEffect(() => {
    if (view !== "map" || distanceOrigin) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        saveMapOrigin(pos);
        setUserPos(pos);
        setDistanceOrigin(pos);
        setLocateTarget(pos);
      },
      () => {
        clearMapOrigin();
        setUserPos(null);
        setDistanceOrigin(null);
        setLocateTarget(MELAKA_CENTER);
        notify("Couldn't get your location — showing vendors near Melaka centre.", true);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function backToDashboard() {
    navigate("/discover", { replace: true });
  }

  const profileMeta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = profileMeta.avatar_url || "";
  const firstName = profileMeta.first_name || "";
  const initials = firstName
    ? (profileMeta.first_name?.[0] || "") + (profileMeta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");

  // The API's initial distance is measured from Melaka centre so its response
  // can be usefully ordered before the user shares a position. Discovery's
  // distance controls must not treat that fallback as the user's distance:
  // expose distKm only after GPS or a typed origin creates a real anchor.
  const vendorsWithDistance = useMemo(() => distanceOrigin
    ? vendors.map((vendor) => (
      vendor.latitude == null || vendor.longitude == null
        ? { ...vendor, distKm: undefined }
        : {
            ...vendor,
            distKm: haversineKm(distanceOrigin.lat, distanceOrigin.lng, vendor.latitude, vendor.longitude),
          }
    ))
    : vendors.map((vendor) => ({ ...vendor, distKm: undefined })),
  [vendors, distanceOrigin]);

  // One collection powers cards, pins and the map sidebar. Downstream views
  // may paginate or apply the map's separate visibility radius, but they never
  // repeat discovery matching or sorting.
  const filteredVendors = useMemo(
    () => sortVendors(vendorsWithDistance.filter((vendor) => matchesFilters(vendor, filters))),
    [vendorsWithDistance, filters],
  );

  if (!API_KEY) {
    return (
      <div className="p-6 font-body">
        <h2 className="mb-2 font-display text-xl text-ink">Missing browser API key</h2>
        <p>Set <code>VITE_MAPS_BROWSER_KEY</code> in <code>frontend/.env</code>, then restart the dev server.</p>
      </div>
    );
  }

  if (view === "dashboard") {
    return (
      <>
        <Dashboard
          vendors={vendorsWithDistance}
          filteredVendors={filteredVendors}
          filters={filters}
          onFilters={updateFilters}
          onClearFilters={clearFilters}
          loading={vendorsLoading}
          loadError={vendorsError}
          onRetryLoad={loadVendors}
          bookmarks={bookmarks}
          onToggleBookmark={toggleBookmark}
          tripVendorIds={new Set(trip.filter((s) => !s.isMe).map((s) => s.id))}
          tripAtLimit={tripAtLimit}
          onAddStop={addStop}
          focusVendorId={focusVendorId}
          onFocusVendorHandled={clearFocusVendor}
          onVendorUpdated={(vendorId, patch) =>
            setVendors((cur) => cur.map((v) => (v.id === vendorId ? { ...v, ...patch } : v)))
          }
        />
        {pendingSaveVendor && (
          <FolderPickerModal
            vendorName={pendingSaveVendor.name}
            folders={folders}
            onClose={() => setPendingSaveVendor(null)}
            onSave={confirmSaveBookmark}
            onCreateFolder={createFolderAndSave}
          />
        )}
        <GuestPrompt open={guestPromptOpen} onClose={() => setGuestPromptOpen(false)} />
        <Toast toast={toast} />
      </>
    );
  }

  if (mapError) {
    return (
      <div className="grid min-h-dvh w-full place-items-center bg-chalk px-6 py-24">
        <div className="max-w-lg rounded-2xl border border-sand bg-white p-8 text-center shadow-[0_10px_30px_rgba(32,42,53,0.08)]">
          <div className="mb-3 text-3xl">🗺️</div>
          <h2 className="mb-2 font-display text-2xl text-ink">Map temporarily unavailable</h2>
          <p className="mb-6 text-sm leading-6 text-muted">
            {mapError} The list view is still available while the map configuration is being updated.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="min-h-11 rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button type="button" className="min-h-11 rounded-lg border border-sand bg-white px-4 py-2 text-sm font-semibold text-ink" onClick={backToDashboard}>
              Back to list
            </button>
          </div>
        </div>
      </div>
    );
  }

  const meIndex = trip.findIndex((s) => s.isMe);
  const vendorStopOrder = new Map();
  trip.forEach((s, i) => { if (!s.isMe) vendorStopOrder.set(s.id, i + 1); });
  const customStops = customStopsForMap(trip);

  // One anchor drives the radius circle, the nearby list and the visible pins,
  // so the three can't disagree about what "nearby" means. It is always "Your
  // location" and nothing else: the map camera centres there on entry, so
  // anchoring anywhere else renders a viewport with no pins in it. With no
  // location set there is no anchor, and the panel says so.
  const anchor = distanceOrigin || (meIndex >= 0 ? trip[meIndex] : null);

  // "all" means no distance limit for the nearby add-to-trip list.
  const effectiveRadiusKm = radiusKm === "all" ? Infinity : radiusKm;
  const stopIds = new Set(vendorStopOrder.keys());

  // Pins respect the active discovery filters, while trip stops survive so a
  // route never loses one of its own markers.
  const filteredIds = new Set(filteredVendors.map((vendor) => vendor.id));
  const pinVendors = vendorsWithDistance
    .filter((vendor) => stopIds.has(vendor.id) || filteredIds.has(vendor.id));
  const visibleFocusVendor = focusVendor && (stopIds.has(focusVendor.id) || filteredIds.has(focusVendor.id))
    ? focusVendor
    : null;

  const visibleVendors = selectVisibleVendors({
    vendors: pinVendors,
    anchor,
    radiusKm: effectiveRadiusKm,
    showAll: showAllVendors,
    stopIds,
    focusVendor: visibleFocusVendor,
  });

  // "Nearby to add" — vendors matching the shared discovery order, not already
  // in the trip, and within the chosen radius of the anchor. Filters on the raw
  // distance so the list and the map pins agree at the boundary; rounds only
  // for display.
  const nearbyToAdd = anchor ? filteredVendors
      .filter((vendor) => vendor.latitude != null && vendor.longitude != null && !stopIds.has(vendor.id))
      .map((vendor) => ({
        ...vendor,
        distKm: haversineKm(anchor.lat, anchor.lng, vendor.latitude, vendor.longitude),
      }))
      .filter((vendor) => vendor.distKm <= effectiveRadiusKm)
      .slice(0, 12)
      .map((vendor) => ({ ...vendor, distKm: parseFloat(vendor.distKm.toFixed(2)) }))
    : [];

  return (
    <APIProvider
      apiKey={API_KEY}
      version="beta"
      libraries={["geometry", "marker", "places"]}
      onError={() => setMapError("Google Maps failed to load. Please check the browser key, Maps JavaScript API, and billing settings.")}
    >
      <CustomPlaceDetailsLoader stops={trip} onDetails={refreshCustomStopDetails} />
      <div className="relative h-dvh w-full overflow-hidden bg-chalk">
        <GMap
          defaultCenter={MELAKA_CENTER}
          defaultZoom={13}
          mapId={MAP_ID}
          colorScheme={isDark ? "DARK" : "LIGHT"}
          gestureHandling="greedy"
          keyboardShortcuts={false}
          className="size-full"
        >
              <MelakaHighlight />
              {/* FocusOnUser must commit before FocusOnVendor — React runs effects in
                  JSX order, and picking a vendor often triggers a first-time
                  locateMe() call in the same update. Without this order, "focus on
                  me" would win and undo the "focus on the vendor I picked" zoom. */}
              <FocusOnUser pos={locateTarget} />
              <FocusOnVendor vendor={visibleFocusVendor} />
              <FocusOnTripStop stop={focusTripStop} />
              <VendorMarkers
                vendors={visibleVendors}
                customStops={customStops}
                userPos={userPos}
                onSelect={setSelected}
                onAddStop={addStop}
                onViewDetails={setDetailVendor}
                tripAtLimit={tripAtLimit}
                tripOrder={vendorStopOrder}
                userStopNumber={meIndex >= 0 ? meIndex + 1 : null}
                selectedId={selected?.id}
                openId={openId}
                onOpenChange={setOpenId}
                radiusCenter={anchor}
                radiusKm={radiusKm}
              />
              {travelMode === "TRANSIT" && !routeConstraint && <TransitLayer />}
              {travelMode && !routeConstraint && (
                <DirectionsRenderer
                  stops={routingStops}
                  travelMode={travelMode}
                  routeIndex={routeIndex}
                  optimizationRequest={optimizationRequest}
                  onSummary={setDirSummary}
                  onRoutes={setRouteOptions}
                  onTransitLegs={setTransitLegs}
                  onRouteDetails={handleRouteDetails}
                  onWarnings={handleRouteWarnings}
                  onCopyrights={handleRouteCopyrights}
                  onOptimizationResult={handleOptimizationResult}
                  onOptimizationError={handleOptimizationError}
                  onError={setDirError}
                />
              )}
        </GMap>

        {!mapFullscreen && (
          <div className="absolute inset-x-0 top-0 z-30">
            {/* This wrapper is the header's stacking context, so it must sit above
                MapPanel (z-20) and the fullscreen control (z-10). */}
            <DiscoveryHeader
              session={session} userEmail={userEmail} initials={initials} firstName={firstName} avatarUrl={avatarUrl}
              savedCount={savedCount}
              onLogin={() => navigate("/login")} onOpenProfile={() => navigate("/profile")}
              onSignUp={() => navigate("/login?mode=signup")}
              activeSection="map"
              onOpenVendor={(id) => setSearchParams({ vendor: id })}
            />
          </div>
        )}

        <button
          onClick={() => setMapFullscreen((v) => !v)}
          title={mapFullscreen ? "Exit fullscreen" : "Fullscreen map"}
          aria-label={mapFullscreen ? "Exit fullscreen" : "Fullscreen map"}
          className={mapFullscreen
            ? "absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-lg border border-sand bg-white shadow-[0_2px_8px_rgba(64,84,74,0.12)]"
            : "absolute right-4 top-44 z-10 grid size-11 place-items-center rounded-lg border border-sand bg-white shadow-[0_2px_8px_rgba(64,84,74,0.12)] md:top-20"}
        >
          {mapFullscreen ? <Minimize2 size={16} color={MAP_COLORS.forest} /> : <Maximize2 size={16} color={MAP_COLORS.forest} />}
        </button>

        <button
          onClick={() => setIsDark((v) => !v)}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className={isDark
            ? "absolute left-3 top-44 z-10 flex min-h-11 items-center gap-1.5 rounded-md border border-[#444] bg-[#1f1f1f] px-2.5 text-xs text-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] md:top-22"
            : "absolute left-3 top-44 z-10 flex min-h-11 items-center gap-1.5 rounded-md border border-[#ccc] bg-white px-2.5 text-xs text-[#333] shadow-[0_2px_6px_rgba(0,0,0,0.2)] md:top-22"}
        >
          {isDark ? "☀️ Light" : "🌙 Dark"}
        </button>

        <button
          onClick={() => locateMe()}
          title="Get current location"
          aria-label="Get current location"
          className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-10 grid size-11 place-items-center rounded-lg border border-sand bg-white text-lg shadow-[0_2px_8px_rgba(64,84,74,0.18)] md:bottom-5"
        >
          📍
        </button>

        {!mapFullscreen && (
          <MapPanel
            tab={panelTab}
            onTab={changeTab}
            collapsed={tripCollapsed}
            onToggleCollapsed={() => setTripCollapsed((v) => !v)}
            tripCount={trip.length}
          >
            {panelTab === "trip" ? (
              <TripPanel
                trip={trip}
                summary={displayedSummary}
                routeMessage={routeMessage}
                transitScopeMessage={transitScopeMessage}
                tripAtLimit={tripAtLimit}
                optimizationLoading={Boolean(optimizationRequest)}
                optimizationComparison={optimizationComparison}
                arrivalRows={arrivalRows}
                routeWarnings={routeWarnings}
                routeCopyrights={routeCopyrights}
                onReorder={reorderTrip}
                onClear={clearTrip}
                onRemove={removeStop}
                onEditStop={editStop}
                travelMode={travelMode}
                onTravelMode={changeTravelMode}
                onManualLocation={setManualLocation}
                onLocateMe={() => locateMe()}
                routeOptions={routeOptions}
                routeIndex={routeIndex}
                onSelectRoute={setRouteIndex}
                transitLegs={transitLegs}
                onAddCustomStop={addCustomStop}
                onTripLimit={showTripLimit}
                onSuggestBestOrder={handleSuggestBestOrder}
                locationBias={anchor || MELAKA_CENTER}
                onFocusStop={setFocusTripStop}
              />
            ) : (
              <VendorPanel
                vendors={vendorsWithDistance}
                filteredVendors={filteredVendors}
                nearby={nearbyToAdd}
                filters={filters}
                onFilters={updateFilters}
                onClearFilters={clearFilters}
                radiusKm={radiusKm}
                onRadiusChange={setRadiusKm}
                showAllVendors={showAllVendors}
                onToggleAllVendors={() => setShowAllVendors((v) => !v)}
                onAddStop={addStop}
                tripAtLimit={tripAtLimit}
                onSelectNearby={selectNearby}
                hasAnchor={anchor != null}
                tripIds={new Set(trip.map((s) => s.id))}
              />
            )}
          </MapPanel>
        )}

        {pendingSaveVendor && (
          <FolderPickerModal
            vendorName={pendingSaveVendor.name}
            folders={folders}
            onClose={() => setPendingSaveVendor(null)}
            onSave={confirmSaveBookmark}
            onCreateFolder={createFolderAndSave}
          />
        )}
        {detailVendor && (
          <VendorDetailModal
            key={detailVendor.id}
            vendor={detailVendor}
            inTrip={vendorStopOrder.has(detailVendor.id)}
            bookmarked={bookmarks.has(detailVendor.id)}
            onToggleBookmark={toggleBookmark}
            onAddStop={addStop}
            tripAtLimit={tripAtLimit}
            onClose={() => setDetailVendor(null)}
            onVendorUpdated={(vendorId, patch) => {
              setDetailVendor((current) => (current && current.id === vendorId ? { ...current, ...patch } : current));
            }}
          />
        )}
        <GuestPrompt open={guestPromptOpen} onClose={() => setGuestPromptOpen(false)} />
        <Toast toast={toast} />
      </div>
    </APIProvider>
  );
}
