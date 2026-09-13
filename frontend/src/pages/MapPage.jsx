import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { APIProvider, Map as GMap, useMap } from "@vis.gl/react-google-maps";
import { Maximize2, Minimize2 } from "lucide-react";
import { getRestaurants, getTrip } from "../api";
import { useSession } from "../lib/SessionContext";
import { getBookmarks, getFolders, addBookmark, removeBookmark, createFolder } from "../api/engagement";
import VendorMarkers from "../components/VendorMarkers";
import TripStopMarkers from "../components/TripStopMarkers";
import MelakaHighlight from "../components/MelakaHighlight";
import TripPanel from "../components/TripPanel";
import MapPanel from "../components/MapPanel";
import VendorPanel from "../components/VendorPanel";
import DirectionsRenderer from "../components/DirectionsRenderer";
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
import { newDraft, newStopId, rowsFor, groupStopsByPosition } from "../lib/tripStops";
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

function FitToTrip({ trip, panelVisible }) {
  const map = useMap();
  const groups = useMemo(() => groupStopsByPosition(trip), [trip]);
  const key = trip.map((stop) => `${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}`).sort().join("|");

  useEffect(() => {
    if (!map || groups.length === 0) return;
    if (groups.length === 1) {
      map.panTo({ lat: groups[0].lat, lng: groups[0].lng });
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    groups.forEach((group) => bounds.extend({ lat: group.lat, lng: group.lng }));
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const padding = desktop
      ? { top: 96, right: panelVisible ? 372 : 48, bottom: 48, left: 48 }
      : { top: 72, right: 24, bottom: panelVisible ? Math.round(window.innerHeight * 0.64) + 24 : 72, left: 24 };
    map.fitBounds(bounds, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, panelVisible]);
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
  const [bookmarkRows, setBookmarkRows] = useState([]); // {vendor_id, folder_id, folder} from the server
  const [folders, setFolders] = useState([]);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null); // vendor awaiting a folder pick
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const [detailVendor, setDetailVendor] = useState(null);
  const bookmarks = new Set(bookmarkRows.map((r) => r.vendor_id));
  const [focusVendor, setFocusVendor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [openId, setOpenId] = useState(null); // vendor id whose InfoWindow is open
  const [userPos, setUserPos] = useState(null);
  const [locateTarget, setLocateTarget] = useState(null);
  const [radiusKm, setRadiusKm] = useState(2); // drives the "Nearby to add" list and its displayed radius
  const [filters, setFilters] = useState(DEFAULT_VENDOR_FILTERS);
  const [vendorVisibleCount, setVendorVisibleCount] = useState(15);
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
  const [trip, setTrip] = useState([]);              // unified draggable stops (resolved only)
  const [draftStops, setDraftStops] = useState(() => [newDraft("anchor")]); // coordinate-free placeholder rows
  const [focusDraftId, setFocusDraftId] = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [travelMode, setTravelMode] = useState("DRIVING");   // "DRIVING" | "TWO_WHEELER" | "TRANSIT" | "WALKING"
  const [hydratedOwner, setHydratedOwner] = useState(null);
  const [dirSummary, setDirSummary] = useState(null);
  const [routeError, setRouteError] = useState("");      // Google-route failure, display-only — never mutates trip/stops
  const [routeIndex, setRouteIndex] = useState(0);       // selected alt route (DRIVING)
  const [routeOptions, setRouteOptions] = useState([]);  // alt routes + toll flags (DRIVING)
  const [transitLegs, setTransitLegs] = useState([]);    // itinerary legs (TRANSIT)
  const [isDark, setIsDark] = useState(false);
  const [toast, notify] = useToast();
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    const stored = loadTrip(owner);
    const stops = stored?.stops || [];
    setTrip(stops);
    setDraftStops(stops.some((stop) => stop.type === "anchor") ? [] : [newDraft("anchor")]);
    setTravelMode(stored?.travelMode || "DRIVING");
    setDirSummary(null);
    setRouteError("");
    setRouteOptions([]);
    setTransitLegs([]);
    setHydratedOwner(owner);
  }, [owner, sessionLoading]);

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

  // Persist the trip on every change (id/type/vendorId/name/lat/lng only —
  // see lib/tripStorage.js for why the embedded `vendor` snapshot isn't saved).
  useEffect(() => {
    if (hydratedOwner !== owner) return;
    saveTrip(trip, travelMode, owner);
  }, [trip, travelMode, owner, hydratedOwner]);

  // A trip restored from storage carries vendor stops with no `vendor` object
  // (it's never persisted). Re-attach it by vendorId once the vendor list loads.
  useEffect(() => {
    if (!vendors.length) return;
    setTrip((current) => current.map((stop) => {
      if (stop.type !== "vendor" || stop.vendor) return stop;
      const vendor = vendors.find((candidate) => candidate.id === stop.vendorId);
      return vendor ? { ...stop, vendor } : stop;
    }));
  }, [vendors, hydratedOwner]);

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

  // Each stop is a normal draggable entry — the anchor too. A vendor can be
  // added more than once: each occurrence gets its own stop id but shares the
  // vendor's database id via vendorId.
  const vendorStop = (vendor) => ({
    id: newStopId("vendor-stop"), type: "vendor", vendorId: vendor.id,
    name: vendor.name, lat: vendor.latitude, lng: vendor.longitude, vendor,
  });
  // `place.label` is present when the origin came from Places Autocomplete,
  // absent for GPS — so a typed origin reads as its address instead of a
  // generic string.
  const anchorStop = (place) => ({
    id: newStopId("anchor-stop"), type: "anchor",
    name: place.label || "Your current location", lat: place.lat, lng: place.lng,
  });

  async function planTrip(list) {
    if (list.length < 2) return;
    setTripLoading(true);
    try {
      const points = list.map((stop) => ({ lat: stop.lat, lng: stop.lng }));
      const result = await getTrip(points, true);
      setTrip(result.order.map((index) => list[index]));
    } catch (error) {
      console.error(error);
      notify("Couldn't work out a better order right now. Your stops are unchanged.", true);
    } finally {
      setTripLoading(false);
    }
  }

  // The only function that writes the anchor's coordinates (D13). Entry GPS
  // passes onlyIfEmpty so a searched anchor is never overwritten by a late fix;
  // the map GPS button and the anchor row's own controls always retarget.
  function placeAnchor(place, { onlyIfEmpty = false } = {}) {
    const name = place.label || "Your current location";
    setTrip((current) => {
      const existing = current.some((stop) => stop.type === "anchor");
      if (existing && onlyIfEmpty) return current;
      if (!existing) return [anchorStop(place), ...current];
      return current.map((stop) => stop.type === "anchor"
        ? { ...stop, name, lat: place.lat, lng: place.lng }
        : stop);
    });
    setDraftStops((current) => current.filter((draft) => draft.type !== "anchor"));
  }

  function addStop(vendor) {
    const stop = vendorStop(vendor);
    const list = [...trip, stop];
    const number = rowsFor(list, draftStops).find((row) => row.id === stop.id).number;
    setTrip(list);
    notify(`${vendor.name} added to trip as stop ${number}.`);
  }
  function reorderTrip(newList) { setTrip(newList); }

  function addDraftStop() {
    const draft = newDraft("custom");
    setDraftStops((current) => [...current, draft]);
    setFocusDraftId(draft.id);
    return draft.id;
  }

  function resolveDraft(id, place) {
    const draft = draftStops.find((candidate) => candidate.id === id);
    if (!draft) return;
    const stop = {
      id: newStopId(`${draft.type}-stop`), type: draft.type,
      name: place.label, lat: place.lat, lng: place.lng,
    };
    setDraftStops((current) => current.filter((candidate) => candidate.id !== id));
    setTrip((current) => {
      if (draft.type === "anchor" && current.some((candidate) => candidate.type === "anchor")) return current;
      return draft.type === "anchor" ? [stop, ...current] : [...current, stop];
    });
    setFocusDraftId(null);
  }

  function retargetStop(id, place) {
    setTrip((current) => current.map((stop) => {
      if (stop.id !== id || stop.type === "vendor") return stop;
      return { ...stop, name: place.label, lat: place.lat, lng: place.lng };
    }));
  }

  function useGpsForRow(id, isDraft) {
    const row = isDraft ? draftStops.find((draft) => draft.id === id) : trip.find((stop) => stop.id === id);
    if (row?.type === "anchor") { locateMe(); return; } // D13 (c): same path as the map GPS button
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        labelForPosition(coords).then((labelled) => {
          const place = { ...labelled, label: labelled.label || "Your current location" };
          if (isDraft) resolveDraft(id, place);
          else retargetStop(id, place);
          setUserPos(labelled);
        });
      },
      () => notify("Location unavailable. Search for a place or try GPS again.", true),
    );
  }

  // Protects the anchor from both flows: a draft anchor can never be
  // discarded via Remove, and a resolved anchor is filtered out of the list
  // Remove operates on.
  function removeStop(id, isDraft = false) {
    if (isDraft) {
      setDraftStops((current) => current.filter((draft) => draft.id !== id || draft.type === "anchor"));
      return;
    }
    setTrip((current) => current.filter((stop) => stop.id !== id || stop.type === "anchor"));
  }

  function selectNearby(vendor) {
    setFocusVendor(vendor);
    setSelected(vendor);
    setOpenId(vendor.id);
  }

  // Keeps the anchor and the chosen transport mode — only the vendor/custom
  // stops (the actual destinations) are cleared, so the user can immediately
  // start building a new trip from where they are without resetting mode/GPS.
  function clearTrip() {
    const kept = trip.filter((stop) => stop.type === "anchor").slice(0, 1);
    setTrip(kept);
    setDraftStops(kept.length ? [] : [newDraft("anchor")]);
    setDirSummary(null);
    setRouteError("");
    setRouteOptions([]);
    setTransitLegs([]);
  }

  // A previously-picked alt route index shouldn't survive a mode switch or a
  // fresh route recalculation — always default back to Google's top pick.
  useEffect(() => { setRouteIndex(0); }, [travelMode, trip]);

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

  // Map GPS button: the device position becomes the search area (D13 b).
  function locateMe() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocateTarget(coords);
        labelForPosition(coords).then((labelled) => {
          setUserPos(labelled);
          placeAnchor(labelled);
        });
      },
      () => {
        setLocateTarget(MELAKA_CENTER);
        notify("Location unavailable. Search for a place or try GPS again.", true);
      },
    );
  }

  // Centre the map on the user the first time they arrive at /map. This used
  // to run inside the header's Map toggle; with Map as a plain link there is
  // no click handler left to hang it on. Guarded on a ref so it asks for
  // permission once per session, not on every visit.
  const locationRequestedRef = useRef(false);
  useEffect(() => {
    if (view !== "map" || locationRequestedRef.current) return;
    locationRequestedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocateTarget(coords);
        labelForPosition(coords).then((labelled) => {
          setUserPos(labelled);
          placeAnchor(labelled, { onlyIfEmpty: true }); // D13 (a): never overwrites a searched anchor
        });
      },
      () => {
        setLocateTarget(MELAKA_CENTER);
        notify("Location unavailable. Search for a place or try GPS again.", true);
      },
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

  // The single resolved anchor drives distance, the radius circle and the
  // nearby list, so the three can't disagree about what "nearby" means (D13).
  const searchAnchor = useMemo(
    () => trip.find((stop) => stop.type === "anchor") || null,
    [trip],
  );

  // The API's initial distance is measured from Melaka centre so its response
  // can be usefully ordered before the anchor is set. Discovery's distance
  // controls must not treat that fallback as the anchor's distance: expose
  // distKm only once a resolved anchor exists.
  const vendorsWithDistance = useMemo(() => searchAnchor
    ? vendors.map((vendor) => (
      vendor.latitude == null || vendor.longitude == null
        ? { ...vendor, distKm: undefined }
        : {
            ...vendor,
            distKm: haversineKm(searchAnchor.lat, searchAnchor.lng, vendor.latitude, vendor.longitude),
          }
    ))
    : vendors.map((vendor) => ({ ...vendor, distKm: undefined })),
  [vendors, searchAnchor]);

  // One collection powers cards, pins and the map sidebar. Downstream views
  // may paginate or apply the map's separate visibility radius, but they never
  // repeat discovery matching or sorting.
  const filteredVendors = useMemo(
    () => sortVendors(vendorsWithDistance.filter((vendor) => matchesFilters(vendor, filters))),
    [vendorsWithDistance, filters],
  );

  // Vendor database ids currently on the trip (an occurrence can repeat, so
  // this is membership, not the display order — Task 7 replaces numbering).
  const tripVendorIds = useMemo(
    () => new Set(trip.filter((stop) => stop.type === "vendor").map((stop) => stop.vendorId)),
    [trip],
  );

  const nearbyVendors = useMemo(() => {
    if (!searchAnchor) return [];
    const effectiveRadiusKm = radiusKm === "all" ? Infinity : radiusKm;
    return sortVendors(
      filteredVendors.filter((vendor) =>
        vendor.latitude != null
        && vendor.longitude != null
        && Number.isFinite(vendor.distKm)
        && vendor.distKm <= effectiveRadiusKm),
      "nearest",
    );
  }, [filteredVendors, searchAnchor, radiusKm]);

  // Reordering, adding, or removing stops must not collapse a list the user
  // already expanded — only a change to the geography or filters being
  // searched resets it. Reordering the anchor leaves its coordinates
  // unchanged, so it does not reset the count either.
  useEffect(() => {
    setVendorVisibleCount(15);
  }, [searchAnchor?.lat, searchAnchor?.lng, radiusKm, filters]);

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

  // The map-only anchor is the same single resolved anchor used for distance.
  // It is always the trip's anchor stop and nothing else: the map camera
  // centres there on entry, so anchoring anywhere else renders a viewport
  // with no pins in it. With no anchor yet, the panel says so.
  const anchor = searchAnchor;

  // "all" means no distance limit for the nearby add-to-trip list.
  const effectiveRadiusKm = radiusKm === "all" ? Infinity : radiusKm;

  // Pins respect the active discovery filters, while trip stops survive so a
  // route never loses one of its own markers.
  const filteredIds = new Set(filteredVendors.map((vendor) => vendor.id));
  const pinVendors = vendorsWithDistance
    .filter((vendor) => tripVendorIds.has(vendor.id) || filteredIds.has(vendor.id));
  const visibleFocusVendor = focusVendor && (tripVendorIds.has(focusVendor.id) || filteredIds.has(focusVendor.id))
    ? focusVendor
    : null;

  const visibleVendors = selectVisibleVendors({
    vendors: pinVendors,
    anchor,
    radiusKm: effectiveRadiusKm,
    showAll: showAllVendors,
    stopIds: tripVendorIds,
    focusVendor: visibleFocusVendor,
  });
  const clusterVendors = visibleVendors.filter((vendor) => !tripVendorIds.has(vendor.id));


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
              <FitToTrip trip={trip} panelVisible={!mapFullscreen && !tripCollapsed} />
              <VendorMarkers
                vendors={clusterVendors}
                onSelect={setSelected}
                onAddStop={addStop}
                onViewDetails={setDetailVendor}
                selectedId={selected?.id}
                openId={openId}
                onOpenChange={setOpenId}
              />
              <TripStopMarkers trip={trip} draftStops={draftStops} userPos={userPos} />
              {travelMode === "TRANSIT" && <TransitLayer />}
              <DirectionsRenderer
                stops={trip}
                travelMode={travelMode}
                routeIndex={routeIndex}
                onSummary={(summary) => {
                  setDirSummary(summary);
                  setRouteError(summary?.error
                    ? "No route is available for these stops. Try changing their order or location."
                    : "");
                }}
                onRoutes={setRouteOptions}
                onTransitLegs={setTransitLegs}
              />
        </GMap>

        {!mapFullscreen && (
          <div className="absolute inset-x-0 top-0 z-30">
            {/* This wrapper is the header's stacking context, so it must sit above
                MapPanel (z-20) and the fullscreen control (z-10). */}
            <DiscoveryHeader
              session={session} userEmail={userEmail} initials={initials} firstName={firstName} avatarUrl={avatarUrl}
              savedCount={bookmarks.size}
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
                draftStops={draftStops}
                summary={dirSummary}
                routeError={routeError}
                loading={tripLoading}
                onReorder={reorderTrip}
                onClear={clearTrip}
                onRemove={removeStop}
                onAddDraft={addDraftStop}
                onResolveDraft={resolveDraft}
                onRetargetStop={retargetStop}
                onUseGps={useGpsForRow}
                focusDraftId={focusDraftId}
                travelMode={travelMode}
                onTravelMode={setTravelMode}
                routeOptions={routeOptions}
                routeIndex={routeIndex}
                onSelectRoute={setRouteIndex}
                transitLegs={transitLegs}
                onSuggestBestOrder={() => planTrip(trip)}
              />
            ) : (
              <VendorPanel
                vendors={vendorsWithDistance}
                filteredVendors={filteredVendors}
                nearby={nearbyVendors}
                visibleCount={vendorVisibleCount}
                onShowMore={() => setVendorVisibleCount((count) => count + 15)}
                filters={filters}
                onFilters={updateFilters}
                onClearFilters={clearFilters}
                radiusKm={radiusKm}
                onRadiusChange={setRadiusKm}
                showAllVendors={showAllVendors}
                onToggleAllVendors={() => setShowAllVendors((v) => !v)}
                onAddStop={addStop}
                onSelectNearby={selectNearby}
                hasAnchor={anchor != null}
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
            bookmarked={bookmarks.has(detailVendor.id)}
            onToggleBookmark={toggleBookmark}
            onAddStop={addStop}
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
