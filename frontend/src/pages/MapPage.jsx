import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { APIProvider, Map as GMap, useMap } from "@vis.gl/react-google-maps";
import { Maximize2, Minimize2 } from "lucide-react";
import { getRestaurants, getTrip } from "../api";
import { useSession } from "../lib/SessionContext";
import { getBookmarks, getFolders, addBookmark, removeBookmark, createFolder, getAccountStatus } from "../api/engagement";
import VendorMarkers from "../components/VendorMarkers";
import MelakaHighlight from "../components/MelakaHighlight";
import TripPanel from "../components/TripPanel";
import MapPanel from "../components/MapPanel";
import VendorPanel from "../components/VendorPanel";
import TripPolyline from "../components/TripPolyline";
import DirectionsRenderer from "../components/DirectionsRenderer";
import TransitLayer from "../components/TransitLayer";
import Dashboard from "../components/Dashboard";
import DiscoveryHeader from "../components/discovery/DiscoveryHeader";
import FolderPickerModal from "../components/engagement/FolderPickerModal";
import Toast from "../components/engagement/Toast";
import { useToast, sleep } from "../lib/useToast";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";
import { loadTrip, saveTrip } from "../lib/tripStorage";
import { loadPanelTab, savePanelTab } from "../lib/panelPrefs";
import { MAP_COLORS } from "../lib/mapColors";
import { selectVisibleVendors, haversineKm } from "../lib/mapVisibility";
import {
  DEFAULT_VENDOR_FILTERS,
  matchesFilters,
  sortVendors,
} from "../lib/vendorFilters";
import { shortPlaceName } from "../lib/placeName";
import { customerSession } from "../lib/roles";

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

export default function MapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "map" ? "map" : "dashboard";     // "dashboard" | "map"
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
  const { session: authSession } = useSession();
  const session = customerSession(authSession);
  const [bookmarkRows, setBookmarkRows] = useState([]); // {vendor_id, folder_id, folder} from the server
  const [folders, setFolders] = useState([]);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null); // vendor awaiting a folder pick
  const bookmarks = new Set(bookmarkRows.map((r) => r.vendor_id));
  const [focusVendor, setFocusVendor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [openId, setOpenId] = useState(null); // vendor id whose InfoWindow is open
  const [userPos, setUserPos] = useState(null);
  // Kept separate from userPos because the map may fall back to Melaka centre
  // after a denied/failed geolocation request. That fallback is useful for the
  // camera and nearby panel, but it must never masquerade as the user's origin.
  const [distanceOrigin, setDistanceOrigin] = useState(null);
  const [locateTarget, setLocateTarget] = useState(null);
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

  // Trip planning is unauthenticated, browser-local state — restored from
  // localStorage on mount (see lib/tripStorage.js) so a reload doesn't lose it.
  const [trip, setTrip] = useState(() => loadTrip()?.stops || []);              // unified draggable stops
  const [tripData, setTripData] = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [travelMode, setTravelMode] = useState(() => loadTrip()?.travelMode || null);   // null | "DRIVING" | "TWO_WHEELER" | "TRANSIT" | "WALKING"
  const [dirSummary, setDirSummary] = useState(null);
  const [routeIndex, setRouteIndex] = useState(0);       // selected alt route (DRIVING)
  const [routeOptions, setRouteOptions] = useState([]);  // alt routes + toll flags (DRIVING)
  const [transitLegs, setTransitLegs] = useState([]);    // itinerary legs (TRANSIT)
  const [isDark, setIsDark] = useState(false);
  const [toast, notify] = useToast();
  const [accountStatus, setAccountStatus] = useState(null);
  const [mapError, setMapError] = useState("");

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

  // Suspended customers can still sign in and browse (see backend/lib/suspension.js)
  // but shouldn't be able to use the interactive map/trip planner — checked
  // on every visit, not just at sign-in, since a suspension applied mid-session
  // doesn't invalidate the token that's already loaded.
  useEffect(() => {
    if (!session) { setAccountStatus(null); return; }
    let active = true;
    getAccountStatus().then((status) => { if (active) setAccountStatus(status); }).catch(() => {});
    return () => { active = false; };
  }, [session]);

  // Defense in depth against openMapNearby's guard — covers a direct URL
  // edit, a stale bookmark, or browser back/forward landing on ?view=map.
  useEffect(() => {
    if (view === "map" && accountStatus?.suspended) {
      notify("Your account is suspended — the map isn't available right now.", true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, accountStatus]);

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
  useEffect(() => { saveTrip(trip, travelMode); }, [trip, travelMode]);

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

  // Recompute the route for a trip restored from storage — path/distance/
  // duration are never persisted (they're cheap to recompute and would
  // otherwise go stale). Runs once; DirectionsRenderer already handles this
  // reactively when a travelMode was also restored.
  useEffect(() => {
    if (trip.length >= 2 && !travelMode) planTrip(trip, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bookmarks are server-backed and auth-gated — an anonymous browser sees
  // none, and any local state is dropped the moment the session disappears.
  useEffect(() => {
    if (!session && !ENGAGEMENT_TEST_MODE) { setBookmarkRows([]); setFolders([]); return; }
    refreshBookmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function refreshBookmarks() {
    getFolders().then((f) => setFolders(f.folders)).catch((e) => console.error("failed to load folders:", e.message));
    getBookmarks().then((b) => setBookmarkRows(b.bookmarks)).catch((e) => console.error("failed to load bookmarks:", e.message));
  }

  // Each stop is a normal draggable entry — the user's location too.
  const vendorStop = (v) => ({ id: v.id, name: v.name, lat: v.latitude, lng: v.longitude, isMe: false, vendor: v });
  // `pos.label` is present when the origin came from Places Autocomplete, absent
  // for GPS — so a typed origin reads as its address instead of a generic string.
  const meStop = (pos) => ({ id: "__me__", name: pos.label || "Your location", lat: pos.lat, lng: pos.lng, isMe: true });

  async function planTrip(list, optimize) {
    if (list.length < 2) { setTripData(null); return; }
    setTripLoading(true);
    try {
      const points = list.map((s) => ({ lat: s.lat, lng: s.lng }));
      const res = await getTrip(points, optimize);
      if (optimize) setTrip(res.order.map((i) => list[i]));
      setTripData({ path: res.path, distance: res.distance, duration: res.duration });
    } catch (e) {
      console.error(e);
      notify("Trip planning failed (the free routing server may be busy). Please try again.", true);
    } finally {
      setTripLoading(false);
    }
  }

  useEffect(() => {
    if (!userPos) return;
    const hasMe = trip.some((s) => s.isMe);
    const next = hasMe
      ? trip.map((s) => (s.isMe ? { ...s, lat: userPos.lat, lng: userPos.lng, name: userPos.label || "Your location" } : s))
      : [meStop(userPos), ...trip];
    setTrip(next);
    planTrip(next, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  function addStop(vendor) {
    if (trip.some((s) => s.id === vendor.id)) return;
    const list = [...trip, vendorStop(vendor)];
    setTrip(list);
    planTrip(list, true);
    notify(`${vendor.name} added to your trip.`);
  }
  // A typed place (not a vendor) — e.g. "pick up a friend on the way".
  function addCustomStop(place) {
    const stop = { id: `custom-${Date.now()}`, name: place.label, lat: place.lat, lng: place.lng, isMe: false, source: "custom" };
    const list = [...trip, stop];
    setTrip(list);
    planTrip(list, true);
    notify(`${place.label} added to your trip.`);
  }
  function reorderTrip(newList) { setTrip(newList); planTrip(newList, false); }
  function removeStop(id) { const list = trip.filter((s) => s.id !== id); setTrip(list); planTrip(list, false); }
  // Re-typing the address of a custom stop already on the trip (vendor stops
  // aren't editable — they're removed and re-added if wrong; "Your location"
  // uses setManualLocation instead, since that also updates userPos/GPS state).
  function editStop(id, place) {
    const list = trip.map((s) => (s.id === id ? { ...s, name: place.label, lat: place.lat, lng: place.lng } : s));
    setTrip(list);
    planTrip(list, false);
  }

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
    setTrip(list);
    setTripData(null);
    setDirSummary(null);
    setRouteOptions([]);
    setTransitLegs([]);
  }

  // Manual start location typed via Places Autocomplete — same effect as
  // geolocation resolving, just fed a chosen address instead of GPS.
  function setManualLocation(pos) {
    setUserPos(pos);
    setDistanceOrigin(pos);
    setLocateTarget(pos);
  }

  // A previously-picked alt route index shouldn't survive a mode switch or a
  // fresh route recalculation — always default back to Google's top pick.
  useEffect(() => { setRouteIndex(0); }, [travelMode, trip]);

  // Un-saving is a plain delete; saving opens the folder picker (rendered by
  // each view below) so the vendor lands somewhere the user chose.
  function toggleBookmark(id) {
    if (!session && !ENGAGEMENT_TEST_MODE) { navigate("/login"); return; }
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
        // Label first, then set userPos once. The [userPos] effect re-plans the
        // trip with optimize=true, so setting it twice would silently reorder
        // the user's stops the moment the geocode came back.
        labelForPosition(pos).then((labelled) => {
          setUserPos(labelled);
          setDistanceOrigin(labelled);
        });
      },
      () => {
        setUserPos(MELAKA_CENTER);
        setDistanceOrigin(null);
        setFilters((current) => ({ ...current, distance: "any" }));
        if (!silent) {
          setLocateTarget(MELAKA_CENTER);
          notify("Couldn't get your location — showing Melaka centre instead.", true);
        }
      }
    );
  }

  // Entry point for the Dashboard's "Map" tab — jump to the map centred on the
  // user. Which pins render is the radius toggle's job, not this function's.
  function openMapNearby() {
    if (accountStatus?.suspended) {
      notify("Your account is suspended — the map isn't available right now.", true);
      return;
    }
    const focusOn = (pos) => {
      setUserPos(pos);
      setDistanceOrigin(pos);
      setLocateTarget(pos);
      setFocusVendor(null);
      setSelected(null);
      setSearchParams({ view: "map" });
    };
    if (distanceOrigin) { focusOn(distanceOrigin); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => focusOn({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        setUserPos(MELAKA_CENTER);
        setDistanceOrigin(null);
        setFilters((current) => ({ ...current, distance: "any" }));
        setLocateTarget(MELAKA_CENTER);
        setFocusVendor(null);
        setSelected(null);
        setSearchParams({ view: "map" });
        notify("Couldn't get your location — showing vendors near Melaka centre.", true);
      }
    );
  }

  function backToDashboard() {
    setSearchParams({}, { replace: true });
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
          hasLocation={distanceOrigin != null}
          loading={vendorsLoading}
          loadError={vendorsError}
          onRetryLoad={loadVendors}
          bookmarks={bookmarks}
          onToggleBookmark={toggleBookmark}
          onOpenMap={openMapNearby}
          tripVendorIds={new Set(trip.filter((s) => !s.isMe).map((s) => s.id))}
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

  // One anchor drives the radius circle, the nearby list and the visible pins,
  // so the three can't disagree about what "nearby" means. It is always "Your
  // location" and nothing else: the map camera centres there on entry, so
  // anchoring anywhere else renders a viewport with no pins in it. With no
  // location set there is no anchor, and the panel says so.
  const anchor = userPos || null;

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
      libraries={["geometry", "marker", "places"]}
      onError={(error) => setMapError(`Google Maps failed to load: ${error?.message || "authorization or billing error."}`)}
    >
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
              <VendorMarkers
                vendors={visibleVendors}
                userPos={userPos}
                onSelect={setSelected}
                onAddStop={addStop}
                tripOrder={vendorStopOrder}
                userStopNumber={meIndex >= 0 ? meIndex + 1 : null}
                selectedId={selected?.id}
                openId={openId}
                onOpenChange={setOpenId}
                radiusCenter={anchor}
                radiusKm={radiusKm}
              />
              {travelMode === "TRANSIT" && <TransitLayer />}
              {travelMode
                ? (
                  <DirectionsRenderer
                    stops={trip}
                    travelMode={travelMode}
                    routeIndex={routeIndex}
                    onSummary={setDirSummary}
                    onRoutes={setRouteOptions}
                    onTransitLegs={setTransitLegs}
                  />
                )
                : tripData?.path && <TripPolyline path={tripData.path} />
              }
        </GMap>

        {!mapFullscreen && (
          <div className="absolute inset-x-0 top-0 z-10">
            <DiscoveryHeader
              session={session} userEmail={userEmail} initials={initials} firstName={firstName} avatarUrl={avatarUrl}
              savedCount={bookmarks.size}
              onLogin={() => navigate("/login")} onOpenProfile={() => navigate("/profile")}
              onSignUp={() => navigate("/login")}
              activeSection={null}
              mapActive
              onOpenDiscover={backToDashboard}
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
                summary={travelMode ? dirSummary : tripData}
                loading={tripLoading}
                onReorder={reorderTrip}
                onClear={clearTrip}
                onRemove={removeStop}
                onEditStop={editStop}
                travelMode={travelMode}
                onTravelMode={setTravelMode}
                onManualLocation={setManualLocation}
                onLocateMe={() => locateMe()}
                routeOptions={routeOptions}
                routeIndex={routeIndex}
                onSelectRoute={setRouteIndex}
                transitLegs={transitLegs}
                onAddCustomStop={addCustomStop}
                onSuggestBestOrder={() => planTrip(trip, true)}
              />
            ) : (
              <VendorPanel
                vendors={vendorsWithDistance}
                filteredVendors={filteredVendors}
                nearby={nearbyToAdd}
                filters={filters}
                onFilters={updateFilters}
                onClearFilters={clearFilters}
                hasLocation={distanceOrigin != null}
                radiusKm={radiusKm}
                onRadiusChange={setRadiusKm}
                showAllVendors={showAllVendors}
                onToggleAllVendors={() => setShowAllVendors((v) => !v)}
                onAddStop={addStop}
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
        <Toast toast={toast} />
      </div>
    </APIProvider>
  );
}
