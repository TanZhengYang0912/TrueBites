import { AlertTriangle, Ban, Check, FileDown, ImagePlus, List, MapPinned, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  commitVendorPhoto, createAdminVendor, deleteAdminVendor, deleteVendorGalleryImage, getAdminVendorDuplicates,
  getAdminVendors, updateAdminVendor, uploadVendorGalleryImage, uploadVendorImage,
} from "../../api/admin";
import Toast from "../../components/engagement/Toast";
import ImageLightbox from "../../components/engagement/ImageLightbox";
import PhotoDiscoveryPanel from "../../components/admin/PhotoDiscoveryPanel";
import AdminVendorMap from "../../components/admin/AdminVendorMap";
import VendorLocationPicker from "../../components/admin/VendorLocationPicker";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import { useToast } from "../../lib/useToast";
import { placeholderImage } from "../../lib/vendorDisplay";
import { fetchAllPages, openVendorsPdf } from "../../lib/exportPdf";

const CATEGORIES = ["Malaysian / Local", "Nyonya / Peranakan", "Chinese", "Cafe / Dessert", "Western"];
const STATUS_OPTIONS = ["all", "active", "draft", "suspended"];
const SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "az", label: "Name A–Z" },
  { value: "za", label: "Name Z–A" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

// Each sortable column header toggles between an ascending and a descending
// sort value (both backed by the API's `sort` param); a third click clears back
// to "default".
const COLUMN_SORTS = {
  vendor: ["az", "za"],
  category: ["cat_az", "cat_za"],
  status: ["status", "status_desc"],
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

// Mirrors MAX_GALLERY_IMAGES in backend/lib/vendorValidation.js — the server
// is the real enforcement point, this just keeps the "Add" tile from
// appearing once a vendor is already full.
const MAX_GALLERY_IMAGES = 8;

// Every 30-min slot in 12-hour form, zero-padded — "12:00 AM", "12:30 AM", "01:00 AM" … "11:30 PM".
// Matches the DB's stored hour format; picking from this list can never produce
// garbage like the "50 - 90" / "3 - 4" values some AI-extracted rows have.
const HOUR_SLOTS = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const period = h < 12 ? "AM" : "PM";
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    HOUR_SLOTS.push(`${String(displayHour).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`);
  }
}

const MELAKA_BOUNDS = { latMin: 1.8, latMax: 2.6, lngMin: 101.8, lngMax: 102.8 };
// Mirrors backend/lib/suggestionValidation.js's isMalaccaLocation — same
// word-boundary match, both English spellings, kept as a plain regex here
// since the frontend can't import backend code.
const MELAKA_ADDRESS_RE = /\b(?:malacca|melaka)\b/i;
// Same key/provider as VendorLocationPicker.jsx (the map) and
// LocationInput.jsx (the customer trip-planner's location search) — one
// shared Google Maps browser key across the whole app.
const API_KEY = import.meta.env.VITE_MAPS_BROWSER_KEY;
const PHONE_RE = /^(\+?60|0)\d{8,10}$/;

const emptyForm = {
  vendor_name: "",
  address: "",
  latitude: "",
  longitude: "",
  cuisine_types: CATEGORIES[0],
  priceMin: "",
  priceMax: "",
  openSlot: "09:00 AM",
  closeSlot: "06:00 PM",
  signature_dishes: "",
  phone: "",
  status: "draft",
  imageFile: null,
  imagePreview: null,
  source_video_url: "",
};

// "RM 10 - RM 20 per person" / "RM10-20 per person" / "RM 20 per person" (equal
// min/max, single-value form) -> { priceMin: "10", priceMax: "20" }
function parsePriceRange(str) {
  const range = (str || "").match(/RM\s*(\d+(?:\.\d+)?)\s*-\s*(?:RM\s*)?(\d+(?:\.\d+)?)/i);
  if (range) return { priceMin: range[1], priceMax: range[2] };
  const single = (str || "").match(/RM\s*(\d+(?:\.\d+)?)/i);
  if (single) return { priceMin: single[1], priceMax: single[1] };
  return { priceMin: "", priceMax: "" };
}

// Swaps min/max if entered backwards; collapses to a single value when equal.
function formatPriceRange(minRaw, maxRaw) {
  let min = Number.parseFloat(minRaw);
  let max = Number.parseFloat(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) [min, max] = [max, min];
  if (min === max) return `RM ${min} per person`;
  return `RM ${min} - RM ${max} per person`;
}

// "07:00 AM - 02:00 PM" -> { openSlot: "07:00 AM", closeSlot: "02:00 PM" }.
// Garbage strings ("50 - 90", "3 - 4", "30:00 PM - 10") don't match this
// pattern at all and fall back to sane defaults — editing + saving such a
// vendor replaces the bad value with a clean one.
const HOURS_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;

function toSlot(hh, mm, period) {
  const h = Math.min(12, Math.max(1, Number.parseInt(hh, 10) || 12));
  const min = Number.parseInt(mm, 10) >= 15 ? 30 : 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")} ${period.toUpperCase()}`;
}

function parseHours(str) {
  const m = (str || "").match(HOURS_RE);
  if (!m) return { openSlot: "09:00 AM", closeSlot: "06:00 PM" };
  const openSlot = toSlot(m[1], m[2], m[3]);
  const closeSlot = toSlot(m[4], m[5], m[6]);
  return {
    openSlot: HOUR_SLOTS.includes(openSlot) ? openSlot : "09:00 AM",
    closeSlot: HOUR_SLOTS.includes(closeSlot) ? closeSlot : "06:00 PM",
  };
}

function makeForm(vendor) {
  return {
    vendor_name: vendor.name || "",
    address: vendor.fullAddress || "",
    latitude: vendor.latitude != null ? String(vendor.latitude) : "",
    longitude: vendor.longitude != null ? String(vendor.longitude) : "",
    cuisine_types: CATEGORIES.includes(vendor.category) ? vendor.category : CATEGORIES[0],
    ...parsePriceRange(vendor.priceRange),
    ...parseHours(vendor.operatingHours),
    signature_dishes: vendor.dishes?.join(", ") || "",
    phone: vendor.phone || "",
    status: (vendor.status || "draft").toLowerCase(),
    imageFile: null,
    source_video_url: vendor.sourceVideoUrl || "",
    // Seed the dropzone preview from the same resolver the public site uses —
    // for a vendor with no real upload yet, this shows the curated/category
    // photo currently displayed to users, not a blank box.
    imagePreview: placeholderImage({
      id: vendor.id, name: vendor.name,
      storefront_image_url: vendor.imageUrl,
      cuisine_types: vendor.category, signature_dishes: vendor.dishes?.join(", "),
    }),
  };
}

function validateForm(form) {
  const errors = {};

  const name = form.vendor_name.trim();
  if (!name) errors.vendor_name = "Vendor name is required.";
  else if (name.length < 2 || name.length > 120) errors.vendor_name = "Must be 2–120 characters.";

  const address = form.address.trim();
  if (!address) errors.address = "Address is required.";
  else if (!MELAKA_ADDRESS_RE.test(address)) errors.address = "Address must be in Melaka (Malacca).";

  const lat = Number.parseFloat(form.latitude);
  if (form.latitude === "" || Number.isNaN(lat)) errors.latitude = "Latitude is required.";
  else if (lat < MELAKA_BOUNDS.latMin || lat > MELAKA_BOUNDS.latMax) {
    errors.latitude = `Outside Melaka (${MELAKA_BOUNDS.latMin}–${MELAKA_BOUNDS.latMax}).`;
  }

  const lng = Number.parseFloat(form.longitude);
  if (form.longitude === "" || Number.isNaN(lng)) errors.longitude = "Longitude is required.";
  else if (lng < MELAKA_BOUNDS.lngMin || lng > MELAKA_BOUNDS.lngMax) {
    errors.longitude = `Outside Melaka (${MELAKA_BOUNDS.lngMin}–${MELAKA_BOUNDS.lngMax}).`;
  }

  if (form.priceMin === "" || Number.isNaN(Number.parseFloat(form.priceMin)) || Number(form.priceMin) < 0) {
    errors.priceMin = "Required (number ≥ 0).";
  }
  if (form.priceMax === "" || Number.isNaN(Number.parseFloat(form.priceMax)) || Number(form.priceMax) < 0) {
    errors.priceMax = "Required (number ≥ 0).";
  }

  if (!form.signature_dishes.trim()) errors.signature_dishes = "Signature dishes are required.";

  // Optional — not every stall has a published number.
  const phone = form.phone.trim();
  if (phone && !PHONE_RE.test(phone.replace(/[\s-]/g, ""))) errors.phone = "Invalid Malaysian number, e.g. 06-283 1234.";

  if (form.openSlot === form.closeSlot) errors.hours = "Opening and closing time can't be the same.";

  return errors;
}

// Fields that actually get sent to PATCH /api/admin/vendors/:id — used to
// detect whether an edit session has any real change to save. imageFile /
// imagePreview are deliberately excluded: those are compared separately
// (imageFile != null means a new cover was picked).
const FORM_COMPARE_KEYS = [
  "vendor_name", "address", "latitude", "longitude", "cuisine_types",
  "priceMin", "priceMax", "openSlot", "closeSlot", "signature_dishes",
  "phone", "status", "source_video_url",
];

function formFieldsEqual(a, b) {
  return FORM_COMPARE_KEYS.every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

function Pagination({ pagination, pageSize, onPageChange, onPageSizeChange }) {
  const { page, totalPages, total } = pagination;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="admin-pagination">
      <div className="admin-pagination-meta">
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> vendors
      </div>
      <div className="admin-pagination-controls">
        <label className="admin-page-size">
          Rows
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" className="admin-secondary-btn compact" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span>Page {page} / {totalPages}</span>
        <button type="button" className="admin-secondary-btn compact" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function FieldError({ message }) {
  return message ? <div className="admin-field-error">{message}</div> : null;
}

// Marks a label as "can't be left blank" — Name/Address/Latitude/Longitude/
// Price Range/Signature Dishes below. Deliberately NOT on Category/Operating
// Hours/Status (selects always carry a value, so there's no blank state to
// warn about) or Phone (optional — see validateForm).
function RequiredMark() {
  return <span className="admin-required-mark" aria-hidden="true"> *</span>;
}

// Table-row thumbnail — uses the SAME resolver as the public site
// (placeholderImage), so admin sees exactly what a user would see: the real
// storefront photo if one's been uploaded, else the curated food-photo
// manifest, else a category stock photo. Resets its error flag whenever
// imageUrl changes so a freshly-uploaded photo always gets a fresh load
// attempt instead of getting stuck on a stale failure.
function VendorThumb({ vendor, className }) {
  const [failedSource, setFailedSource] = useState(null);
  const src = placeholderImage({ storefront_image_url: vendor.imageUrl });
  const sourceKey = JSON.stringify([vendor.id, src]);
  const imageClass = className || "admin-table-thumb";

  return !src || failedSource === sourceKey
    ? <span className={`${imageClass} flex items-center justify-center bg-slate-50 text-center text-[9px] leading-tight text-slate-500`} role="img" aria-label={`No photo for ${vendor.name}`}>No photo</span>
    : <img key={sourceKey} src={src} alt="" className={imageClass} loading="lazy" onError={() => setFailedSource(sourceKey)} />;
}

// Drag-and-drop (or click-to-browse) image field. `onFileChange` receives the
// File directly — callers don't need to know whether it came from a drop or
// the hidden <input>.
function ImageDropzone({ form, onFileChange, disabled }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [imageError, setImageError] = useState("");
  const [objectUrl, setObjectUrl] = useState(null);

  useEffect(() => {
    if (!form.imageFile) { setObjectUrl(null); return; }
    const url = URL.createObjectURL(form.imageFile);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.imageFile]);

  const preview = objectUrl || form.imagePreview || null;

  const pickFile = (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setImageError("Please choose a JPEG, PNG, WebP or GIF image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError("Image must be under 8 MB.");
      return;
    }
    setImageError("");
    onFileChange(file);
  };

  return (
    <label>
      <span>Add Image</span>
      <div
        className={`admin-dropzone${dragOver ? " drag-over" : ""}${disabled ? " disabled" : ""}`}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          pickFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => pickFile(e.target.files?.[0])}
          disabled={disabled}
          style={{ display: "none" }}
        />
        {preview ? (
          <img src={preview} alt="Storefront preview" className="admin-dropzone-preview" />
        ) : (
          <div className="admin-dropzone-empty">
            <ImagePlus size={18} />
            <span>Drag & drop or click to upload</span>
          </div>
        )}
      </div>
      <FieldError message={imageError} />
    </label>
  );
}

// Extra photos (food/interior shots) shown after the cover in the customer-
// facing card-hover and detail-modal carousels. Only usable once the vendor
// already has an id — a brand-new vendor gets its cover through the dropzone
// above and picks up a gallery afterwards, from this same edit view.
//
// Adding a photo still hits the server immediately (matching how the cover
// dropzone itself uploads on file pick). Removing one does NOT — when the
// caller supplies `onRequestRemove` (the Edit-vendor modal), a click just
// asks the parent to confirm, and actual deletion is deferred until the
// parent applies it (on Save) or drops it (on Cancel); the photo meanwhile
// renders in a "pending removal" state via `pendingDeletes`. Callers that
// don't pass `onRequestRemove` (the post-create AddVendorModal gallery step,
// which has no separate Save/Cancel step) keep the original immediate-delete
// behavior unchanged.
function GalleryManager({ vendorId, images, disabled, pendingDeletes, onChange, onRequestRemove, onUndoRemove, onManualAdd, notify }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  // Click-to-enlarge preview — reuses the same lightbox review photos use.
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const canAdd = !disabled && !busy && images.length < MAX_GALLERY_IMAGES;

  const pickFile = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setGalleryError("Please choose a JPEG, PNG, WebP or GIF image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setGalleryError("Image must be under 8 MB.");
      return;
    }
    setGalleryError("");
    setBusy(true);
    try {
      const { gallery_image_urls } = await uploadVendorGalleryImage(vendorId, file);
      const added = gallery_image_urls.find((u) => !images.includes(u));
      onChange(gallery_image_urls);
      if (added) onManualAdd?.(added);
    } catch (err) {
      notify?.(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const removeImageNow = async (url) => {
    setBusy(true);
    try {
      const { gallery_image_urls } = await deleteVendorGalleryImage(vendorId, url);
      onChange(gallery_image_urls);
    } catch (err) {
      notify?.(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveClick = (url) => {
    if (onRequestRemove) onRequestRemove(url);
    else removeImageNow(url);
  };

  return (
    <>
    <label>
      <span>Gallery Photos ({images.length}/{MAX_GALLERY_IMAGES})</span>
      <div
        className="admin-gallery-grid"
        onDragOver={(e) => { e.preventDefault(); if (canAdd) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!canAdd) return;
          pickFile(e.dataTransfer.files?.[0]);
        }}
      >
        {images.map((url) => {
          const pending = pendingDeletes?.has(url);
          return (
            <div className={`admin-gallery-thumb${pending ? " pending-removal" : ""}`} key={url}>
              <img
                src={url}
                alt=""
                loading="lazy"
                onClick={(e) => {
                  // This whole block sits inside a <label> (for the hidden
                  // upload <input> below) — without preventDefault, clicking
                  // a plain, non-form-control child like this <img> also
                  // forwards the click to that input and pops the OS file
                  // picker. Always prevent that; only actually open the
                  // preview in View mode (`disabled`) — Edit mode has no
                  // click-to-preview.
                  e.preventDefault();
                  if (disabled) setPreviewUrl(url);
                }}
                style={{ cursor: disabled ? "zoom-in" : "default" }}
              />
              {!disabled && (
                pending ? (
                  <div className="admin-gallery-thumb-pending">
                    <span>Pending removal</span>
                    <button type="button" className="admin-link-btn" onClick={() => onUndoRemove?.(url)}>
                      Undo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="admin-gallery-thumb-remove"
                    onClick={() => handleRemoveClick(url)}
                    disabled={busy}
                    aria-label="Remove photo"
                  >
                    <Trash2 size={12} />
                  </button>
                )
              )}
            </div>
          );
        })}
        {!disabled && images.length < MAX_GALLERY_IMAGES && (
          <button
            type="button"
            className={`admin-gallery-add${dragOver ? " drag-over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus size={16} />
            <span>{busy ? "Uploading…" : dragOver ? "Drop to add" : "Add"}</span>
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
        style={{ display: "none" }}
      />
      <FieldError message={galleryError} />
    </label>
    <ImageLightbox src={previewUrl} onClose={() => setPreviewUrl(null)} />
    </>
  );
}

// Google Places Autocomplete on the Address field — the same API
// LocationInput.jsx uses for the customer-facing trip planner's location
// search, sharing the same VITE_MAPS_BROWSER_KEY, so both surfaces behave
// (and fail) identically instead of drifting apart. Replaces the previous
// Photon (OpenStreetMap) implementation that lived here specifically
// because this project's Google Cloud billing was disabled at the time —
// if that's stable now, this depends on the same Maps availability the
// location picker map already requires, for both the map and the address
// search together. Picking a suggestion fires the standard form `onChange`
// three times (address, latitude, longitude), the same plumbing every
// other field uses.
function AddressAutocompleteField({ form, error, onChange, disabled, notify }) {
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef(null);
  // The place_changed listener below is attached once, when the library
  // first loads — keep it reading the LATEST onChange via a ref so it
  // never closes over a stale one from a prior render (e.g. switching which
  // vendor is being edited without unmounting this field).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!placesLib || !inputRef.current || disabled) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "name", "geometry"],
      componentRestrictions: { country: "my" },
      // Hard-restricted to Melaka (strictBounds) — the whole platform is
      // Melaka-only (see MELAKA_ADDRESS_RE/validateForm below and
      // vendorActivationIssues on the backend), so the suggestion dropdown
      // should never even offer a place outside it. A typed address that
      // bypasses the dropdown entirely is still caught by validateForm's own
      // Melaka/Malacca text check on save.
      bounds: {
        south: MELAKA_BOUNDS.latMin, north: MELAKA_BOUNDS.latMax,
        west: MELAKA_BOUNDS.lngMin, east: MELAKA_BOUNDS.lngMax,
      },
      strictBounds: true,
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      if (!loc) {
        notify?.("Couldn't find coordinates for that place — enter them manually.", true);
        return;
      }
      const label = place.formatted_address || place.name || inputRef.current.value;
      onChangeRef.current({ target: { name: "address", value: label } });
      onChangeRef.current({ target: { name: "latitude", value: String(loc.lat()) } });
      onChangeRef.current({ target: { name: "longitude", value: String(loc.lng()) } });
    });

    return () => listener.remove();
  }, [placesLib, disabled, notify]);

  return (
    <label className="admin-address-field">
      <span>Address<RequiredMark /></span>
      <input
        ref={inputRef}
        name="address"
        value={form.address}
        onChange={onChange}
        disabled={disabled}
        placeholder="Start typing a Melaka address…"
        autoComplete="off"
      />
      {!disabled && (
        <span className="admin-field-hint">Pick a suggestion to auto-fill the map coordinates.</span>
      )}
      <FieldError message={error} />
    </label>
  );
}

// Plain fallback when Google Maps isn't available at all (no key configured,
// or the API failed to load) — mirrors VendorLocationPicker.jsx's own
// fallback so the form stays usable either way.
function PlainAddressField({ form, error, onChange, disabled, hint }) {
  return (
    <label className="admin-address-field">
      <span>Address<RequiredMark /></span>
      <input
        name="address"
        value={form.address}
        onChange={onChange}
        disabled={disabled}
        placeholder="Address"
        autoComplete="off"
      />
      {hint && <span className="admin-field-hint">{hint}</span>}
      <FieldError message={error} />
    </label>
  );
}

function AddressAutocomplete({ form, error, onChange, disabled, notify, loadError }) {
  // Shares one <APIProvider> with VendorLocationPicker below (see
  // VendorFormFields) rather than creating its own — Google Maps JS can only
  // be loaded once per page with one fixed `libraries` list.
  if (!API_KEY) {
    return (
      <PlainAddressField
        form={form} error={error} onChange={onChange} disabled={disabled}
        hint="Address search unavailable — Google Maps browser key not configured."
      />
    );
  }

  if (loadError) {
    return (
      <PlainAddressField
        form={form} error={error} onChange={onChange} disabled={disabled}
        hint={`Address search failed to load (${loadError}) — enter the address manually.`}
      />
    );
  }

  return <AddressAutocompleteField form={form} error={error} onChange={onChange} disabled={disabled} notify={notify} />;
}

// Shared by the Add Vendor modal, the Edit form, AND the read-only View —
// `disabled` greys every control out for View, without duplicating markup.
function VendorFormFields({ form, errors, onChange, onFileChange, disabled, notify }) {
  // AddressAutocomplete (Places) and VendorLocationPicker (the map + marker)
  // both need the Google Maps JS API, and it can only be loaded ONCE per
  // page with ONE fixed `libraries` list — a second <APIProvider> with a
  // different list is silently ignored ("already been loaded with different
  // parameters" in the console), which is exactly what happened when each
  // had its own provider. One shared provider here, passed down, is the fix.
  const [mapsError, setMapsError] = useState("");

  const fields = (
    <>
      <label>
        <span>Name<RequiredMark /></span>
        <input name="vendor_name" value={form.vendor_name} onChange={onChange} disabled={disabled} placeholder="e.g. Cendol Pak Hj Ramli" />
        <FieldError message={errors?.vendor_name} />
      </label>

      <AddressAutocomplete form={form} error={errors?.address} onChange={onChange} disabled={disabled} notify={notify} loadError={mapsError} />

      <div className="admin-modal-grid">
        <label>
          <span>Latitude<RequiredMark /></span>
          <input type="number" step="any" name="latitude" value={form.latitude} onChange={onChange} disabled={disabled} placeholder="e.g. 2.1946" />
          <FieldError message={errors?.latitude} />
        </label>
        <label>
          <span>Longitude<RequiredMark /></span>
          <input type="number" step="any" name="longitude" value={form.longitude} onChange={onChange} disabled={disabled} placeholder="e.g. 102.2485" />
          <FieldError message={errors?.longitude} />
        </label>
      </div>

      <VendorLocationPicker latitude={form.latitude} longitude={form.longitude} onChange={onChange} disabled={disabled} loadError={mapsError} />

      <div className="admin-modal-grid admin-modal-grid-3">
        <label>
          <span>Category</span>
          <select name="cuisine_types" value={form.cuisine_types} onChange={onChange} disabled={disabled}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>
          <span>Price Range (RM / Person)<RequiredMark /></span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12.5, color: "var(--admin-muted)", flexShrink: 0 }}>RM</span>
            <input type="number" min="0" name="priceMin" value={form.priceMin} onChange={onChange} disabled={disabled} style={{ minWidth: 0, width: 56 }} />
            <span style={{ fontSize: 12.5, color: "var(--admin-muted)", flexShrink: 0 }}>–</span>
            <span style={{ fontSize: 12.5, color: "var(--admin-muted)", flexShrink: 0 }}>RM</span>
            <input type="number" min="0" name="priceMax" value={form.priceMax} onChange={onChange} disabled={disabled} style={{ minWidth: 0, width: 56 }} />
          </div>
          <FieldError message={errors?.priceMin || errors?.priceMax} />
        </label>

        <label>
          <span>Operating Hours</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select name="openSlot" value={form.openSlot} onChange={onChange} disabled={disabled} style={{ flex: 1, minWidth: 0 }}>
              {HOUR_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>–</span>
            <select name="closeSlot" value={form.closeSlot} onChange={onChange} disabled={disabled} style={{ flex: 1, minWidth: 0 }}>
              {HOUR_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <FieldError message={errors?.hours} />
        </label>
      </div>

      <label>
        <span>Signature Dishes<RequiredMark /></span>
        <input name="signature_dishes" value={form.signature_dishes} onChange={onChange} disabled={disabled} placeholder="Comma-separated e.g. Cendol, Ice Kacang" />
        <FieldError message={errors?.signature_dishes} />
      </label>

      <div className="admin-modal-grid">
        <label>
          <span>Phone (optional)</span>
          <input name="phone" value={form.phone} onChange={onChange} disabled={disabled} placeholder="e.g. +60 12-345 6789" />
          <FieldError message={errors?.phone} />
        </label>
        <label>
          <span>Status</span>
          <select name="status" value={form.status} onChange={onChange} disabled={disabled}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </div>

      {/* No manual TikTok/video-link input here by design — a vendor's
          source_video_url comes only from the existing AI Content Upload
          workflow. When editing a vendor that already has one (see
          makeForm below), it still flows through untouched to
          PhotoDiscoveryPanel's "Find Photos Automatically", the admin just
          never sees or edits the URL itself. */}
      <ImageDropzone form={form} onFileChange={onFileChange} disabled={disabled} />
    </>
  );

  if (!API_KEY) return fields;

  return (
    <APIProvider
      apiKey={API_KEY}
      libraries={["marker", "places"]}
      onError={(err) => setMapsError(err?.message || "authorization or billing error")}
    >
      {fields}
    </APIProvider>
  );
}

// Read-only side-by-side review of fuzzy name/address matches — nothing here
// deletes or merges anything automatically. `onDeleteRequest` hands off to a
// ConfirmDialog in the parent; this panel only lists pairs and a Delete button.
function DuplicatesPanel({ groups, onClose, onDeleteRequest }) {
  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>Possible Duplicate Vendors</h2>
            <p>Fuzzy name/address matches — review each pair and delete one if it's a real duplicate.</p>
          </div>
          <button type="button" className="admin-icon-btn subtle" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-form">
          {groups.length === 0 ? (
            <div className="admin-empty-state">No possible duplicates found.</div>
          ) : (
            groups.map((g) => (
              <div className="admin-duplicate-pair" key={`${g.a.id}-${g.b.id}`}>
                {[g.a, g.b].map((v) => (
                  <div className="admin-duplicate-pair-card" key={v.id}>
                    <strong>{v.vendor_name}</strong>
                    <div>{v.address || "No address on file"}</div>
                    <div className="admin-duplicate-pair-meta">
                      Status: {v.status || "draft"}
                      {v.latitude != null ? ` · ${Number(v.latitude).toFixed(4)}, ${Number(v.longitude).toFixed(4)}` : ""}
                      {" · "}{Math.round(g.match_score * 100)}% match ({g.match_type})
                    </div>
                    <button
                      type="button"
                      className="admin-secondary-btn compact danger"
                      style={{ marginTop: 8 }}
                      onClick={() => onDeleteRequest(v.id)}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VendorDetailModal({ vendor, editing, form, errors, saving, cancelling, confirmationActive, error, onClose, onChange, onFileChange, onStartEdit, onCancelEdit, onSave, onGalleryChange, onCoverDiscovered, pendingGalleryDeletes, onRequestRemoveGallery, onUndoRemoveGallery, onManualGalleryAdd, notify }) {
  // While editing, backdrop/×/Escape must go through the same path as the
  // Cancel button (onCancelEdit) rather than the plain onClose — Cancel
  // doesn't just drop unsaved text, it also rolls back any gallery photos
  // this edit session already uploaded (uploads hit the server immediately
  // on pick, see GalleryManager above). Routing backdrop/× straight to
  // onClose left those uploads orphaned in storage the moment an admin
  // clicked outside the modal instead of using Cancel — a real contributor
  // to the orphaned-storage backlog scripts/auditOrphanStorage.js exists to
  // clean up.
  const controlsLocked = saving || cancelling || confirmationActive;
  const dismiss = () => {
    if (controlsLocked) return;
    if (editing) onCancelEdit(); else onClose();
  };

  useEffect(() => {
    if (!vendor) return;
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [vendor, dismiss]);

  if (!vendor) return null;

  return (
    <div className="admin-modal-backdrop" onClick={dismiss}>
      <div className="admin-modal-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{editing ? "Edit Vendor" : vendor.name}</h2>
          </div>
          <button type="button" className="admin-icon-btn subtle" onClick={dismiss} disabled={controlsLocked}>×</button>
        </div>

        <div className="admin-modal-form">
          <VendorFormFields form={form} errors={editing ? errors : null} onChange={onChange} onFileChange={onFileChange} disabled={!editing || controlsLocked} notify={notify} />

          {editing && (
            <PhotoDiscoveryPanel
              vendorId={vendor.id}
              latitude={form.latitude}
              longitude={form.longitude}
              coverLocked={vendor.coverLocked}
              onPhotoCommitted={(role, url) => {
                if (role === "cover") {
                  onCoverDiscovered(url);
                } else {
                  onGalleryChange([...(vendor.galleryUrls || []), url]);
                  // Committed to the server immediately, same as a manual
                  // gallery upload — register it as a pending add so Cancel's
                  // existing rollback (below) deletes it back out instead of
                  // silently leaving a "discovered" photo saved after Cancel.
                  onManualGalleryAdd(url);
                }
              }}
              notify={notify}
            />
          )}

          <GalleryManager
            vendorId={vendor.id}
            images={vendor.galleryUrls || []}
            disabled={!editing || controlsLocked}
            pendingDeletes={pendingGalleryDeletes}
            onChange={onGalleryChange}
            onRequestRemove={editing ? onRequestRemoveGallery : undefined}
            onUndoRemove={onUndoRemoveGallery}
            onManualAdd={onManualGalleryAdd}
            notify={notify}
          />

          {!editing && (
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--admin-muted)" }}>
              <span>Source: {vendor.sourcePlatform}</span>
              <span>Location: {vendor.locationPrecision || "Unknown"}</span>
            </div>
          )}

          {error && <div className="admin-feedback error">{error}</div>}

          <div className="admin-modal-actions">
            {editing ? (
              <>
                <button type="button" className="admin-secondary-btn compact" onClick={onCancelEdit} disabled={controlsLocked}>
                  {cancelling ? "Cancelling…" : "Cancel"}
                </button>
                <button type="button" className="admin-primary-btn compact" onClick={onSave} disabled={controlsLocked}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="admin-secondary-btn compact" onClick={onClose}>Close</button>
                <button type="button" className="admin-primary-btn compact" onClick={onStartEdit}>
                  <Pencil size={14} />
                  <span>Edit Vendor</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddVendorModal({ onClose, onCreated, notify }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [promoting, setPromoting] = useState(false);
  // Set when the server flags a fuzzy name/address match (409
  // possible_duplicate) — shown as a warning with an "Add anyway" override
  // instead of silently blocking, since same-named vendors do legitimately exist.
  const [duplicates, setDuplicates] = useState(null);
  // Once the vendor row exists, the modal stops being a "form" and becomes a
  // small gallery-photo-setup step — the gallery upload endpoint needs a real
  // vendorId, so there's nowhere for it to live before this point.
  const [createdVendor, setCreatedVendor] = useState(null);
  const [galleryUrls, setGalleryUrls] = useState([]);
  const [coverUrl, setCoverUrl] = useState(null);
  // Tracks whether the cover was set by a manual upload (vs. automatic photo
  // discovery) — manual always wins, matching the /photos/commit route's own
  // cover_photo_locked guard on the backend.
  const [coverLocked, setCoverLocked] = useState(false);
  // "Find Photos Automatically" candidates the admin picked before the
  // vendor row exists — there's no vendorId yet to commit them to (see
  // PhotoDiscoveryPanel's vendorId==null mode), so they're held here and
  // actually committed in doSave, right after creation succeeds.
  const [stagedCover, setStagedCover] = useState(null);
  const [stagedGallery, setStagedGallery] = useState([]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setDuplicates(null); // edited the form — the last duplicate check is stale
  };
  const handleFileChange = (file) => setForm((prev) => ({ ...prev, imageFile: file }));

  const buildPayload = () => ({
    vendor_name: form.vendor_name,
    address: form.address,
    cuisine_types: form.cuisine_types,
    signature_dishes: form.signature_dishes,
    price_range: formatPriceRange(form.priceMin, form.priceMax),
    phone: form.phone,
    latitude: form.latitude,
    longitude: form.longitude,
    operating_hours_raw: `${form.openSlot} - ${form.closeSlot}`,
    status: form.status,
    source_video_url: form.source_video_url,
  });

  const doSave = async (force) => {
    setSaving(true);
    setError("");
    try {
      const created = await createAdminVendor({ ...buildPayload(), force });
      // Tracks whether a cover ended up set during THIS create — if so, the
      // photo step below (Cover Photo / Find Photos Automatically / Gallery)
      // has nothing left to do that step 1 didn't already cover, so it's
      // skipped in favour of finishing immediately. Left false (falls
      // through to the photo step as a safety net) when nothing was staged
      // in step 1, or a staged cover's commit below actually fails.
      let coverSet = false;
      if (form.imageFile && created?.id) {
        const { storefront_image_url } = await uploadVendorImage(created.id, form.imageFile);
        setCoverUrl(storefront_image_url);
        setCoverLocked(true); // manual upload — the server just locked the cover to match
        coverSet = true;
      } else if (stagedCover && created?.id) {
        // A cover picked via "Find Photos Automatically" in step 1 — commit
        // it for real now that a vendorId finally exists. Manual upload
        // above still wins if the admin somehow did both.
        try {
          const result = await commitVendorPhoto(created.id, {
            provider: stagedCover.provider,
            photoRef: stagedCover.photoRef,
            role: "cover",
            confidence: stagedCover.confidence,
            matchMeta: stagedCover.breakdown,
            dedupeKey: stagedCover.dedupeKey,
          });
          setCoverUrl(result.url);
          coverSet = true;
        } catch (err) {
          notify(`Vendor created, but the selected cover photo couldn't be saved: ${err.message}`, true);
        }
      }
      if (stagedGallery.length && created?.id) {
        const urls = [];
        for (const candidate of stagedGallery) {
          try {
            const result = await commitVendorPhoto(created.id, {
              provider: candidate.provider,
              photoRef: candidate.photoRef,
              role: "gallery",
              confidence: candidate.confidence,
              matchMeta: candidate.breakdown,
              dedupeKey: candidate.dedupeKey,
            });
            urls.push(result.url);
          } catch (err) {
            notify(`One of the selected gallery photos couldn't be saved: ${err.message}`, true);
          }
        }
        setGalleryUrls(urls);
      }
      onCreated();
      if (coverSet) {
        await finishAfterCreate(created);
      } else {
        // Nothing was staged in step 1 (or the staged cover's commit just
        // failed) — fall back to the photo step so the admin still gets a
        // chance to add a cover before Active promotion needs one.
        setCreatedVendor(created);
      }
    } catch (err) {
      if (err.status === 409 && err.payload?.error === "possible_duplicate") {
        setDuplicates(err.payload.duplicates || []);
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      notify("Please fix the highlighted fields before saving.", true);
      return;
    }
    doSave(false);
  };

  // The vendor was inserted as "draft" no matter what Status the form had
  // selected (see the comment on POST /api/admin/vendors) — a fresh row
  // can never have a cover photo yet. If the admin picked Active, this is
  // the point to actually try promoting it: the photo step (manual upload,
  // or "Find Photos Automatically" from either step 1 or step 2) has now
  // had its chance to run, so a cover photo may genuinely exist in the DB by
  // now. Same partial-patch call handleQuickStatus uses elsewhere — the
  // backend re-checks completeness against the vendor's current DB row, not
  // this payload. Shared by the step-2 "Done" button AND doSave's own
  // auto-finish (when a cover was already staged/uploaded in step 1, there's
  // nothing left for step 2 to do, so it's skipped straight to this).
  const finishAfterCreate = async (vendor) => {
    if (form.status === "active") {
      setPromoting(true);
      try {
        await updateAdminVendor(vendor.id, { status: "active" });
        onCreated();
      } catch (err) {
        notify(err.message || "Could not activate — this vendor was saved as a Draft instead. Finish it from Edit Vendor.", true);
      } finally {
        setPromoting(false);
      }
    }
    onClose();
  };

  const handleDone = () => finishAfterCreate(createdVendor);

  if (createdVendor) {
    return (
      <div className="admin-modal-backdrop" onClick={onClose}>
        <div className="admin-modal-card wide" onClick={(e) => e.stopPropagation()}>
          <div className="admin-modal-header">
            <div>
              <h2>{createdVendor.vendor_name}</h2>
              <p>Vendor created — add its photos now, or skip and do it later from Edit.</p>
            </div>
            <button type="button" className="admin-icon-btn subtle" onClick={onClose}>×</button>
          </div>
          <div className="admin-modal-form">
            <label>
              <span>Cover Photo</span>
              <div className="admin-dropzone" style={{ cursor: "default" }}>
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="admin-dropzone-preview" />
                ) : (
                  <div className="admin-dropzone-empty">
                    <ImagePlus size={18} />
                    <span>No cover photo yet — find one automatically below, or add it later from Edit.</span>
                  </div>
                )}
              </div>
            </label>

            <PhotoDiscoveryPanel
              vendorId={createdVendor.id}
              latitude={createdVendor.latitude}
              longitude={createdVendor.longitude}
              coverLocked={coverLocked}
              onPhotoCommitted={(role, url) => {
                if (role === "cover") { setCoverUrl(url); setCoverLocked(false); }
                else setGalleryUrls((cur) => [...cur, url]);
              }}
              notify={notify}
            />

            <GalleryManager
              vendorId={createdVendor.id}
              images={galleryUrls}
              disabled={false}
              onChange={setGalleryUrls}
              notify={notify}
            />
            <div className="admin-modal-actions">
              <button type="button" className="admin-primary-btn compact" onClick={handleDone} disabled={promoting}>
                {promoting ? "Finishing…" : "Done"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>Add Vendor</h2>
            <p>Create a new vendor record in Supabase</p>
          </div>
          <button type="button" className="admin-icon-btn subtle" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-form">
          <VendorFormFields form={form} errors={errors} onChange={handleChange} onFileChange={handleFileChange} disabled={false} notify={notify} />

          <PhotoDiscoveryPanel
            vendorId={null}
            vendorFields={{ vendor_name: form.vendor_name, address: form.address, cuisine_types: form.cuisine_types }}
            latitude={form.latitude}
            longitude={form.longitude}
            coverLocked={!!form.imageFile || !!stagedCover}
            galleryFull={stagedGallery.length >= MAX_GALLERY_IMAGES}
            // Nothing staged here is in vendor_photos yet (no vendor row
            // exists), so the server can't exclude it on "Search Again" the
            // way it does for a real vendorId — this is the client-side
            // equivalent, keyed the same "provider::dedupeKey" way.
            excludeKeys={new Set([
              ...(stagedCover ? [`${stagedCover.provider}::${stagedCover.dedupeKey}`] : []),
              ...stagedGallery.map((c) => `${c.provider}::${c.dedupeKey}`),
            ])}
            onStage={(candidate, role) => {
              if (role === "cover") setStagedCover(candidate);
              else setStagedGallery((cur) => [...cur, candidate]);
            }}
            notify={notify}
          />

          {(stagedCover || stagedGallery.length > 0) && (
            <label>
              <span>Selected via Find Photos Automatically ({(stagedCover ? 1 : 0) + stagedGallery.length})</span>
              <div className="admin-gallery-grid">
                {stagedCover && (
                  <div className="admin-gallery-thumb">
                    <img src={stagedCover.previewUrl} alt="" />
                    <button
                      type="button"
                      className="admin-gallery-thumb-remove"
                      onClick={() => setStagedCover(null)}
                      aria-label="Remove selected cover photo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
                {stagedGallery.map((candidate, i) => (
                  <div className="admin-gallery-thumb" key={`${candidate.photoRef}-${i}`}>
                    <img src={candidate.previewUrl} alt="" />
                    <button
                      type="button"
                      className="admin-gallery-thumb-remove"
                      onClick={() => setStagedGallery((cur) => cur.filter((c) => c !== candidate))}
                      aria-label="Remove selected gallery photo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <span className="admin-field-hint">These are saved once you click Create Vendor.</span>
            </label>
          )}

          {error && <div className="admin-feedback error">{error}</div>}
          {duplicates && (() => {
            // "exact" (>=90% combined name+location match — see
            // vendorDuplicates.js) is, for all practical purposes, the same
            // physical vendor already in the system: same name at the same
            // spot, not a coincidence and not a judgment call. "Add anyway"
            // only makes sense for a "possible" match (ambiguous enough that
            // a human might reasonably decide it's a different vendor);
            // exact matches can't be overridden here, and the backend
            // enforces the same rule even if this button were bypassed.
            const hasExact = duplicates.some((d) => d.match_type === "exact");
            return (
              <div className={`admin-feedback ${hasExact ? "error" : "warning"}`}>
                <strong>
                  {hasExact
                    ? `⚠ This vendor already exists:`
                    : `⚠ Possible duplicate${duplicates.length > 1 ? "s" : ""} found:`}
                </strong>
                <ul className="admin-duplicate-list">
                  {duplicates.map((d) => (
                    <li key={d.id}>
                      {d.vendor_name}{d.address ? ` — ${d.address}` : ""}
                      <span className="admin-duplicate-score"> ({Math.round(d.match_score * 100)}% match)</span>
                    </li>
                  ))}
                </ul>
                {hasExact ? (
                  <p className="admin-field-hint">
                    Same name at the same location — this can't be added as a new vendor. Edit the name/address above if this is actually a different branch, or Cancel.
                  </p>
                ) : (
                  <button type="button" className="admin-secondary-btn compact" onClick={() => doSave(true)} disabled={saving}>
                    {saving ? "Adding…" : "Add anyway"}
                  </button>
                )}
              </div>
            );
          })()}
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onClose}>Cancel</button>
            <button type="button" className="admin-primary-btn compact" onClick={handleSave} disabled={saving}>
              {saving ? "Creating…" : "Create Vendor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminVendorManagementPage() {
  const { setTopbarAction } = useOutletContext();
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // Snapshot of `form` taken the moment Edit starts — the baseline Cancel
  // restores back to and Save diffs against to decide whether there's
  // anything to save at all.
  const [editSnapshot, setEditSnapshot] = useState(null);
  // Gallery photos the admin has confirmed for removal but not yet saved —
  // rendered as "pending removal" and only actually deleted from
  // storage/DB when Save Changes runs.
  const [pendingGalleryDeletes, setPendingGalleryDeletes] = useState(() => new Set());
  // Gallery photos uploaded (via the manual Add button) during this edit
  // session — those already hit the server immediately, so Cancel has to
  // actively undo them, not just drop local state.
  const [pendingGalleryAdds, setPendingGalleryAdds] = useState(() => new Set());
  const [confirmDeleteGalleryUrl, setConfirmDeleteGalleryUrl] = useState(null);
  const [cancellingEdit, setCancellingEdit] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(null);
  const [statusConfirmation, setStatusConfirmation] = useState(null);
  const [saveConfirmation, setSaveConfirmation] = useState(null);
  const [toast, notify] = useToast();
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [showDuplicatesPanel, setShowDuplicatesPanel] = useState(false);
  const [dupDelete, setDupDelete] = useState(null);
  const [dupDeleting, setDupDeleting] = useState(false);
  const [exportingVendors, setExportingVendors] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [mapVendors, setMapVendors] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);

  const loadDuplicates = () =>
    getAdminVendorDuplicates()
      .then((payload) => setDuplicateGroups(payload.groups || []))
      .catch(() => {}); // read-only badge — a failed scan just hides quietly, doesn't block the page

  // Scan once on load — this is a read-only badge, not tied to the current
  // filter/page, so it doesn't need to re-run on every list refresh.
  useEffect(() => {
    loadDuplicates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time search — debounced, no Enter/submit needed.
  useEffect(() => {
    const t = setTimeout(() => setQuery(draftQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [draftQuery]);

  // "Add Vendor" lives in the AdminLayout topbar (left of "View Site") — only
  // this page sets it, via Outlet context; cleared on unmount.
  useEffect(() => {
    setTopbarAction(
      <button type="button" className="admin-primary-btn compact" onClick={() => setShowAddModal(true)}>
        <Plus size={14} />
        <span>Add Vendor</span>
      </button>
    );
    return () => setTopbarAction(null);
  }, [setTopbarAction]);

  // Exports every vendor matching the current filters — not just the page
  // on screen — so the PDF reflects the same search/category/status/sort
  // the admin is looking at.
  const handleExportVendors = async () => {
    setExportingVendors(true);
    try {
      const vendors = await fetchAllPages((pageOpts) => getAdminVendors(pageOpts), {
        params: { status, category, sort, q: query },
      });
      const filterBits = [
        status !== "all" ? `Status: ${status}` : null,
        category !== "all" ? `Category: ${category}` : null,
        query ? `Search: "${query}"` : null,
      ].filter(Boolean);
      await openVendorsPdf({
        title: "Vendor Directory",
        subtitle: filterBits.length ? filterBits.join(" · ") : "All vendors",
        vendors,
      });
    } catch (err) {
      notify(err.message, true);
    } finally {
      setExportingVendors(false);
    }
  };

  const loadVendors = (overrides = {}) => {
    const page = overrides.page ?? data.pagination.page ?? 1;
    setLoading(true);
    setError("");
    return getAdminVendors({ page, pageSize, status, category, sort, q: query })
      .then((payload) => setData(payload))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (viewMode !== "map") return undefined;
    let active = true;
    setMapLoading(true);
    fetchAllPages((pageOpts) => getAdminVendors(pageOpts), {
      params: { status, category, sort, q: query },
    })
      .then((vendors) => { if (active) setMapVendors(vendors); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setMapLoading(false); });
    return () => { active = false; };
  }, [viewMode, status, category, sort, query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getAdminVendors({ page: data.pagination.page, pageSize, status, category, sort, q: query })
      .then((payload) => { if (active) setData(payload); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.pagination.page, status, category, sort, query, pageSize]);

  // Selection is scoped to the current page/filter view — clear it whenever the
  // visible set changes so a stale id can't be bulk-acted on off-screen.
  useEffect(() => {
    setSelectedIds(new Set());
    setConfirmBulkDelete(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.pagination.page, status, category, sort, query, pageSize]);

  const resetToFirstPage = () => setData((cur) => ({ ...cur, pagination: { ...cur.pagination, page: 1 } }));

  const openVendor = (vendor) => {
    setSelectedVendor(vendor);
    setEditing(false);
    setError("");
    setErrors({});
    setForm(makeForm(vendor));
    setEditSnapshot(null);
    setPendingGalleryDeletes(new Set());
    setPendingGalleryAdds(new Set());
  };

  // Opens a vendor straight into Edit mode — used by both the row's Edit
  // (pencil) shortcut and the "Edit Vendor" button inside the View modal.
  // The one thing that must never be skipped here is editSnapshot: it's the
  // pre-edit baseline handleSave diffs the live form against to decide
  // whether anything actually changed. The row shortcut used to call
  // openVendor() (which explicitly nulls editSnapshot, correct for View
  // mode) and then just flip editing on — leaving editSnapshot null while
  // editing=true, which made `editSnapshot ? !formFieldsEqual(...) : false`
  // permanently evaluate to false. Every edit through that shortcut looked
  // unchanged no matter what was actually typed, always blocked with "No
  // changes to save" — confirmed live via the debug logging in handleSave.
  const openVendorForEdit = (vendor, baselineVendor = vendor) => {
    const freshForm = makeForm(vendor);
    const baselineForm = makeForm(baselineVendor);
    setSelectedVendor(vendor);
    setError("");
    setErrors({});
    setForm(freshForm);
    // coverUrl/coverLocked back the cover-photo Cancel rollback below —
    // PhotoDiscoveryPanel's "Set as Cover" commits to the server immediately
    // (unlike the dropzone, which stays local until Save), so Cancel needs
    // to know what to restore it to.
    setEditSnapshot({ form: baselineForm, coverUrl: baselineVendor.imageUrl ?? null, coverLocked: baselineVendor.coverLocked ?? false });
    setPendingGalleryDeletes(new Set());
    setPendingGalleryAdds(new Set());
    setEditing(true);
  };

  const handleMapDragEnd = (vendor, position) => {
    const coordinates = {
      latitude: String(position.lat),
      longitude: String(position.lng),
    };
    openVendorForEdit({ ...vendor, ...coordinates }, vendor);
    // Keep the coordinate update explicit so the dragged values win even if a
    // marker click and dragend arrive in the same render batch. This only
    // changes the controlled form; handleSave remains the persistence gate.
    setForm((current) => ({ ...current, ...coordinates }));
    notify("Pin moved. Save Changes to keep the new location.");
  };

  const handlePageChange = (page) => {
    setData((cur) => ({ ...cur, pagination: { ...cur.pagination, page } }));
  };

  const handleSave = () => {
    if (!selectedVendor) return;
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      // Every other failure path in this function shows a toast — this one
      // didn't, so a blocked save (e.g. latitude/longitude never got filled
      // in) looked identical to a silent no-op instead of an actual error.
      notify("Please fix the highlighted fields before saving.", true);
      return;
    }

    const fieldsChanged = editSnapshot ? !formFieldsEqual(form, editSnapshot.form) : false;
    const coverChanged = !!form.imageFile;
    // "Set as Cover" from Find Photos Automatically commits straight to the
    // server the moment it's clicked (same as a manual gallery add) — it
    // never touches form.imageFile, so `coverChanged` above stays false even
    // though the vendor's actual cover already changed this session. Missing
    // this made a discovery-only edit (no other field touched) look like a
    // no-op and block on "No changes to save", even though the cover really
    // had changed and was already saved. Same comparison
    // handleCancelEdit's own coverChangedByDiscovery already uses below.
    const coverChangedByDiscovery = !!(
      selectedVendor && editSnapshot && (selectedVendor.imageUrl ?? null) !== editSnapshot.coverUrl
    );
    const galleryChanged = pendingGalleryDeletes.size > 0 || pendingGalleryAdds.size > 0;

    if (!fieldsChanged && !coverChanged && !coverChangedByDiscovery && !galleryChanged) {
      notify("No changes to save.");
      return;
    }

    setSaveConfirmation({
      vendor: { ...selectedVendor },
      form: { ...form },
      editSnapshot: editSnapshot ? { ...editSnapshot, form: { ...editSnapshot.form } } : null,
      pendingGalleryDeletes: new Set(pendingGalleryDeletes),
      pendingGalleryAdds: new Set(pendingGalleryAdds),
      fieldsChanged,
      coverChanged,
      coverChangedByDiscovery,
      galleryChanged,
    });
  };

  const executeSave = async (snapshot) => {
    const { vendor, form: savedForm, fieldsChanged, coverChanged, pendingGalleryDeletes: savedDeletes } = snapshot;
    setSaving(true);
    setError("");
    try {
      if (fieldsChanged) {
        await updateAdminVendor(vendor.id, {
          vendor_name: savedForm.vendor_name,
          address: savedForm.address,
          cuisine_types: savedForm.cuisine_types,
          signature_dishes: savedForm.signature_dishes,
          price_range: formatPriceRange(savedForm.priceMin, savedForm.priceMax),
          phone: savedForm.phone,
          latitude: savedForm.latitude,
          longitude: savedForm.longitude,
          operating_hours_raw: `${savedForm.openSlot} - ${savedForm.closeSlot}`,
          status: savedForm.status,
          source_video_url: savedForm.source_video_url,
        });
        // Persisted — if a gallery-delete failure below keeps the modal
        // open for a retry, a second Save click must not resend this.
        // Preserve coverUrl/coverLocked from the original snapshot (not part
        // of this partial save) — overwriting the whole object here used to
        // drop them, which made handleCancelEdit's coverChangedByDiscovery
        // check compare against `undefined` and misfire a spurious cover
        // "restore" (a harmless no-op PATCH, but still wrong) on a Cancel
        // that comes after a field-only save with no cover change at all.
        setEditSnapshot((cur) => ({ ...cur, form: savedForm }));
      }
      if (coverChanged) {
        await uploadVendorImage(vendor.id, savedForm.imageFile);
        setForm((cur) => ({ ...cur, imageFile: null }));
      }

      // Gallery removals only actually hit storage/DB now — the Remove
      // button just staged them earlier, behind a confirmation. Each delete
      // is independent (e.g. someone else may have already removed the same
      // photo), so one failing must not abandon the rest mid-batch, and must
      // not get retried forever — only the ones that actually failed stay
      // pending for a follow-up Save.
      const failedDeletes = new Set();
      for (const url of savedDeletes) {
        try {
          await deleteVendorGalleryImage(vendor.id, url);
        } catch {
          failedDeletes.add(url);
        }
      }
      setPendingGalleryDeletes(failedDeletes);
      setPendingGalleryAdds(new Set());

      const refreshed = await getAdminVendors({ page: data.pagination.page, pageSize, status, category, sort, q: query });
      setData(refreshed);
      if (viewMode === "map") {
        const refreshedMap = await fetchAllPages((pageOpts) => getAdminVendors(pageOpts), {
          params: { status, category, sort, q: query },
        });
        setMapVendors(refreshedMap);
      }

      if (failedDeletes.size > 0) {
        const msg = `Saved, but ${failedDeletes.size} gallery photo${failedDeletes.size === 1 ? "" : "s"} couldn't be deleted — try Save again.`;
        setError(msg);
        notify(msg, true);
        // Leave the modal open so the admin can retry just the failed deletes.
      } else {
        // Saving closes the modal outright — same reasoning as Cancel, it
        // shouldn't drop back into the read-only View screen.
        setSelectedVendor(null);
        setEditing(false);
        setEditSnapshot(null);
        notify("Changes saved successfully.");
      }
    } catch (err) {
      setError(err.message);
      notify(err.message, true);
    } finally {
      setSaving(false);
      setSaveConfirmation(null);
    }
  };

  // Cancel discards all unsaved edits and restores the pre-edit state.
  // Vendor fields / cover-image staging are plain local `form` state, so
  // simply not saving them is enough. Gallery removals were only ever
  // staged locally too (never sent to the server), so those are dropped the
  // same way. Gallery *additions*, though, already hit the server the
  // moment they were picked (same as the cover dropzone's upload-on-pick
  // behavior) — so undoing them here means actively deleting them back out.
  const handleCancelEdit = async () => {
    const coverChangedByDiscovery = selectedVendor && editSnapshot
      && (selectedVendor.imageUrl ?? null) !== editSnapshot.coverUrl;

    if (selectedVendor && (pendingGalleryAdds.size > 0 || coverChangedByDiscovery)) {
      setCancellingEdit(true);
      const ids = [...pendingGalleryAdds];
      for (const url of ids) {
        try {
          await deleteVendorGalleryImage(selectedVendor.id, url);
        } catch {
          // Best-effort rollback — a failed undo just leaves that one photo
          // in place rather than blocking the rest of Cancel.
        }
      }
      // "Set as Cover" from Find Photos Automatically commits to the server
      // immediately, same as a manual gallery add — restore the pre-edit
      // cover the same best-effort way. (The old cover's storage object is
      // deliberately NOT deleted by /photos/commit until Save is confirmed —
      // see the comment there — so this URL still resolves to a real file.)
      if (coverChangedByDiscovery) {
        try {
          await updateAdminVendor(selectedVendor.id, {
            storefront_image_url: editSnapshot.coverUrl,
            cover_photo_locked: editSnapshot.coverLocked,
          });
        } catch {
          // Best-effort — a failed restore leaves the discovered cover in
          // place rather than blocking the rest of Cancel.
        }
      }
      await refreshList();
      setCancellingEdit(false);
    }
    setPendingGalleryDeletes(new Set());
    setPendingGalleryAdds(new Set());
    setEditSnapshot(null);
    setErrors({});
    setError("");
    setSelectedVendor(null);
    setEditing(false);
  };

  const handleDelete = async (target) => {
    setDeleting(true);
    try {
      await deleteAdminVendor(target.id);
      // Clear this as soon as the write succeeds: a refresh failure must not
      // leave a dialog that can repeat a completed deletion.
      setConfirmDelete(null);
      const refreshed = await getAdminVendors({ page: data.pagination.page, pageSize, status, category, sort, q: query });
      setData(refreshed);
      notify("Vendor deleted.");
    } catch (err) {
      setError(err.message);
      notify(err.message, true);
    } finally {
      setDeleting(false);
    }
  };

  // Delete straight from the "possible duplicates" review panel — a separate
  // path from handleDelete above since it's acting on a pair the admin is
  // comparing side-by-side, not a table row. Never runs automatically:
  // findAllDuplicateGroups only ever informs this button, nothing auto-merges.
  const handleDeleteDuplicateVendor = async (target) => {
    setDupDeleting(true);
    try {
      await deleteAdminVendor(target.id);
      setDupDelete(null);
      setDuplicateGroups((groups) => groups.filter((g) => g.a.id !== target.id && g.b.id !== target.id));
      await refreshList();
      notify("Vendor deleted.");
    } catch (err) {
      notify(err.message, true);
    } finally {
      setDupDeleting(false);
    }
  };

  const refreshList = () =>
    getAdminVendors({ page: data.pagination.page, pageSize, status, category, sort, q: query }).then(setData);

  // One-click status change straight from a table row (Approve / Suspend) —
  // reuses the partial-PATCH endpoint, no full edit needed.
  const requestStatusConfirmation = (ids, newStatus, bulk = false) => {
    const names = ids.map((id) => data.items.find((vendor) => vendor.id === id)?.name || "this vendor");
    setStatusConfirmation({ ids: [...ids], names, status: newStatus, bulk });
  };

  const executeStatusConfirmation = async (confirmation) => {
    // The toast alone carries this — `error`/setError below renders a
    // persistent banner whose only action is "reload the vendor list"
    // (see loadVendors's own catch), which doesn't apply to a single row
    // action failing and would just duplicate this same message on screen
    // twice for no benefit.
    setError("");
    try {
      const results = await Promise.allSettled(confirmation.ids.map((id) => updateAdminVendor(id, { status: confirmation.status })));
      const failedIds = confirmation.ids.filter((_, index) => results[index].status === "rejected");
      if (confirmation.bulk) setSelectedIds(new Set(failedIds));
      await refreshList();
      const okCount = confirmation.ids.length - failedIds.length;
      if (!failedIds.length) {
        notify(confirmation.bulk
          ? `${okCount} vendor${okCount === 1 ? "" : "s"} updated.`
          : `Vendor ${confirmation.status === "active" ? "approved" : confirmation.status}.`);
      } else {
        const firstError = results.find((result) => result.status === "rejected")?.reason?.message;
        notify(`${okCount} of ${confirmation.ids.length} vendor${confirmation.ids.length === 1 ? "" : "s"} updated — ${failedIds.length} failed${firstError ? ` (${firstError})` : ""}.`, true);
      }
    } catch (err) {
      notify(err.message, true);
    } finally {
      setStatusConfirmation(null);
    }
  };

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allOnPageSelected = data.items.length > 0 && data.items.every((v) => selectedIds.has(v.id));

  const toggleSelectAll = () => setSelectedIds((prev) => {
    if (data.items.length && data.items.every((v) => prev.has(v.id))) return new Set();
    return new Set(data.items.map((v) => v.id));
  });

  // Promise.all previously meant one rejection (e.g. one vendor failing
  // "activate" completeness validation) discarded the whole batch: no
  // refresh, no selection change, and no indication that the *other* rows
  // in the batch had actually already gone through server-side — the table
  // silently kept showing their old status until the next unrelated reload.
  // allSettled runs every request independently, refreshes once regardless,
  // and leaves only the ones that actually failed selected for a retry.
  const bulkDelete = async (confirmation) => {
    const ids = confirmation.ids;
    setBulkBusy(true);
    setError("");
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteAdminVendor(id)));
      const failedIds = ids.filter((_, i) => results[i].status === "rejected");
      setSelectedIds(new Set(failedIds));
      setConfirmBulkDelete(null);
      await refreshList();
      const okCount = ids.length - failedIds.length;
      if (failedIds.length === 0) {
        notify(`${okCount} vendor${okCount === 1 ? "" : "s"} deleted.`);
      } else {
        const firstError = results.find((r) => r.status === "rejected")?.reason?.message;
        notify(
          `${okCount} of ${ids.length} vendor${ids.length === 1 ? "" : "s"} deleted — ${failedIds.length} failed${firstError ? ` (${firstError})` : ""}.`,
          true
        );
      }
    } catch (err) {
      // The mutation may already have succeeded when the follow-up GET fails.
      // Keep its failed-ID selection intact and avoid offering a stale dialog
      // that could repeat successful deletions; the persistent banner can
      // refresh the list without issuing DELETE again.
      const message = `Vendors were deleted, but the list couldn't refresh: ${err.message}`;
      setError(message);
      notify(message, true);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleHeaderSort = (col) => {
    const [asc, desc] = COLUMN_SORTS[col];
    setSort((cur) => (cur === asc ? desc : cur === desc ? "default" : asc));
    resetToFirstPage();
  };

  const sortIndicator = (col) => {
    const [asc, desc] = COLUMN_SORTS[col];
    if (sort === asc) return "▲";
    if (sort === desc) return "▼";
    return "";
  };

  const ariaSortFor = (col) => {
    const [asc, desc] = COLUMN_SORTS[col];
    if (sort === asc) return "ascending";
    if (sort === desc) return "descending";
    return "none";
  };

  const handlePageSizeChange = (n) => {
    setPageSize(n);
    resetToFirstPage();
  };

  const clearFilters = () => {
    setDraftQuery("");
    setQuery("");
    setStatus("all");
    setCategory("all");
    setSort("default");
    resetToFirstPage();
  };

  const content = (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex h-10 w-full flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 shadow-sm focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300 xl:max-w-2xl">
          <Search size={16} className="text-gray-400" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            value={draftQuery}
            onChange={(e) => { setDraftQuery(e.target.value); resetToFirstPage(); }}
            placeholder="Search Vendors, Categories, Dishes…"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex h-10 items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors ${viewMode === "list" ? "bg-slate-100 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
            >
              <List size={15} /> List
            </button>
            <button
              type="button"
              className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors ${viewMode === "map" ? "bg-slate-100 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              aria-pressed={viewMode === "map"}
              onClick={() => setViewMode("map")}
            >
              <MapPinned size={15} /> Map
            </button>
          </div>
          <div className="relative">
            <select className="h-10 appearance-none rounded-full border border-gray-200 bg-white pl-4 pr-10 text-sm font-semibold text-blue-600 shadow-sm outline-none hover:bg-gray-50 focus:border-gray-300 focus:ring-1 focus:ring-gray-300" value={category} onChange={(e) => { setCategory(e.target.value); resetToFirstPage(); }}>
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
          <div className="relative">
            <select className="h-10 appearance-none rounded-full border border-gray-200 bg-white pl-4 pr-10 text-sm font-semibold text-blue-600 shadow-sm outline-none hover:bg-gray-50 focus:border-gray-300 focus:ring-1 focus:ring-gray-300" value={status} onChange={(e) => { setStatus(e.target.value); resetToFirstPage(); }}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All Statuses" : s[0].toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
          <div className="relative">
            <select className="h-10 appearance-none rounded-full border border-gray-200 bg-white pl-4 pr-10 text-sm font-semibold text-blue-600 shadow-sm outline-none hover:bg-gray-50 focus:border-gray-300 focus:ring-1 focus:ring-gray-300" value={sort} onChange={(e) => { setSort(e.target.value); resetToFirstPage(); }}>
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>

          {duplicateGroups.length > 0 && (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-700 shadow-sm transition-colors hover:bg-amber-100" onClick={() => setShowDuplicatesPanel(true)}>
              <AlertTriangle size={16} />
              {duplicateGroups.length} possible duplicate{duplicateGroups.length > 1 ? "s" : ""}
            </button>
          )}

          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-blue-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
            onClick={handleExportVendors}
            disabled={exportingVendors}
          >
            <FileDown size={16} />
            {exportingVendors ? "Preparing PDF…" : "Export PDF"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="admin-feedback error admin-feedback-row">
          <span>{error}</span>
          <button type="button" className="admin-secondary-btn compact" onClick={() => loadVendors()}>Retry</button>
        </div>
      ) : null}

      {viewMode === "list" && selectedIds.size > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-count">{selectedIds.size} selected</span>
          <div className="admin-bulk-actions">
            <button type="button" className="admin-secondary-btn compact" disabled={bulkBusy} onClick={() => requestStatusConfirmation([...selectedIds], "active", true)}>
              <Check size={14} /> Approve
            </button>
            <button type="button" className="admin-secondary-btn compact" disabled={bulkBusy} onClick={() => requestStatusConfirmation([...selectedIds], "draft", true)}>
              Set Draft
            </button>
            <button type="button" className="admin-secondary-btn compact" disabled={bulkBusy} onClick={() => requestStatusConfirmation([...selectedIds], "suspended", true)}>
              <Ban size={14} /> Suspend
            </button>
            <button type="button" className="admin-secondary-btn compact danger" disabled={bulkBusy} onClick={() => {
              const ids = [...selectedIds];
              setConfirmBulkDelete({ ids, names: ids.map((id) => data.items.find((vendor) => vendor.id === id)?.name || "this vendor") });
            }}>
              <Trash2 size={14} /> Delete
            </button>
            <button type="button" className="admin-link-btn" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {viewMode === "list" ? (
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-gray-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="w-12 px-6 py-4 text-center">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all vendors on this page"
                />
              </th>
              <th className="px-4 py-4">Image</th>
              <th className="cursor-pointer px-4 py-4 hover:text-gray-700" aria-sort={ariaSortFor("vendor")} onClick={() => handleHeaderSort("vendor")}>
                Vendor <span className="text-gray-400">{sortIndicator("vendor")}</span>
              </th>
              <th className="cursor-pointer px-4 py-4 hover:text-gray-700" aria-sort={ariaSortFor("category")} onClick={() => handleHeaderSort("category")}>
                Category <span className="text-gray-400">{sortIndicator("category")}</span>
              </th>
              <th className="px-4 py-4">Hours</th>
              <th className="cursor-pointer px-4 py-4 hover:text-gray-700" aria-sort={ariaSortFor("status")} onClick={() => handleHeaderSort("status")}>
                Status <span className="text-gray-400">{sortIndicator("status")}</span>
              </th>
              <th className="px-4 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
                <tr key={`sk-${i}`} className="admin-skeleton-row">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-4 w-full animate-pulse rounded bg-gray-100" /></td>
                  ))}
                </tr>
              ))
            ) : data.items.length ? (
              data.items.map((vendor) => {
                const st = vendor.status.toLowerCase();
                return (
                <tr
                  key={vendor.id}
                  className={`group cursor-pointer transition-colors hover:bg-gray-50 ${selectedIds.has(vendor.id) ? "bg-blue-50/40" : ""}`}
                  onClick={() => openVendor(vendor)}
                >
                  <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      checked={selectedIds.has(vendor.id)}
                      onChange={() => toggleSelect(vendor.id)}
                      aria-label={`Select ${vendor.name}`}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="size-10 overflow-hidden rounded-[10px] border border-gray-200 bg-gray-50">
                      <VendorThumb vendor={vendor} className="h-full w-full object-cover" />
                    </div>
                  </td>
                  <td className="px-4 py-4 font-bold text-gray-900">
                    <button type="button" className="text-left font-bold text-gray-900" onClick={(event) => { event.stopPropagation(); openVendor(vendor); }}>
                      {vendor.name}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-gray-500">{vendor.category}</td>
                  <td className="px-4 py-4 text-gray-500">{vendor.operatingHours || "—"}</td>
                  <td className="px-4 py-4">
                    {st === "active" ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                        {vendor.status}
                      </span>
                    ) : st === "draft" ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                        {vendor.status}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-700">
                        {vendor.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-3 text-gray-400">
                      {st !== "active" && (
                        <button type="button" className="transition-colors hover:text-emerald-600" onClick={() => requestStatusConfirmation([vendor.id], "active")} aria-label={`Approve ${vendor.name}`} title="Approve">
                          <Check size={16} />
                        </button>
                      )}
                      {st === "active" && (
                        <button type="button" className="transition-colors hover:text-gray-600" onClick={() => requestStatusConfirmation([vendor.id], "suspended")} aria-label={`Suspend ${vendor.name}`} title="Suspend">
                          <Ban size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="transition-colors hover:text-gray-600"
                        onClick={() => openVendorForEdit(vendor)}
                        aria-label={`Edit ${vendor.name}`}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="transition-colors hover:text-red-500"
                        onClick={() => setConfirmDelete({ id: vendor.id, name: vendor.name })}
                        aria-label={`Delete ${vendor.name}`}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7">
                  <div className="py-12 text-center">
                    <p className="text-gray-500">No vendors matched this filter.</p>
                    <div className="mt-4 flex justify-center gap-3">
                      <button type="button" className="admin-secondary-btn compact" onClick={clearFilters}>Clear filters</button>
                      <button type="button" className="admin-primary-btn compact" onClick={() => setShowAddModal(true)}>
                        <Plus size={14} /> Add Vendor
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination
          pagination={data.pagination}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Vendor map</h2>
              <p className="text-sm text-gray-500">
                {mapLoading ? "Loading vendors…" : `${mapVendors.length} vendor${mapVendors.length === 1 ? "" : "s"} in the current filter`}
              </p>
            </div>
            <span className="text-xs text-gray-500">Click a pin to view details · drag a pin to edit its coordinates</span>
          </div>
          {mapLoading ? (
            <div className="grid min-h-[420px] place-items-center rounded-xl border border-gray-200 bg-slate-50 text-sm text-gray-500">
              Loading vendor pins…
            </div>
          ) : (
            <AdminVendorMap vendors={mapVendors} onSelect={openVendor} onDragEnd={handleMapDragEnd} />
          )}
        </section>
      )}

      <VendorDetailModal
        vendor={selectedVendor}
        editing={editing}
        form={form}
        errors={errors}
        saving={saving}
        cancelling={cancellingEdit}
        confirmationActive={!!saveConfirmation || !!confirmDeleteGalleryUrl}
        error={error}
        onClose={() => setSelectedVendor(null)}
        onStartEdit={() => selectedVendor && openVendorForEdit(selectedVendor)}
        onCancelEdit={handleCancelEdit}
        onChange={(e) => {
          const { name, value } = e.target;
          setForm((cur) => ({ ...cur, [name]: value }));
        }}
        onFileChange={(file) => setForm((cur) => ({ ...cur, imageFile: file }))}
        onSave={handleSave}
        notify={notify}
        pendingGalleryDeletes={pendingGalleryDeletes}
        onRequestRemoveGallery={(url) => setConfirmDeleteGalleryUrl(url)}
        onUndoRemoveGallery={(url) => setPendingGalleryDeletes((cur) => {
          const next = new Set(cur);
          next.delete(url);
          return next;
        })}
        onManualGalleryAdd={(url) => setPendingGalleryAdds((cur) => new Set(cur).add(url))}
        onGalleryChange={(galleryUrls) => {
          // Keep both the open detail view and the underlying row in sync so
          // a reopened modal (or the table, if it ever grows a gallery
          // preview) reflects the change without a full refetch.
          setSelectedVendor((cur) => (cur ? { ...cur, galleryUrls } : cur));
          setData((cur) => ({
            ...cur,
            items: cur.items.map((v) => (v.id === selectedVendor?.id ? { ...v, galleryUrls } : v)),
          }));
        }}
        onCoverDiscovered={(url) => {
          // Same sync as onGalleryChange, above, plus the dropzone preview
          // (form.imagePreview) so the admin sees the new cover immediately
          // without needing to click Save Changes first.
          setForm((cur) => ({ ...cur, imagePreview: url }));
          setSelectedVendor((cur) => (cur ? { ...cur, imageUrl: url } : cur));
          setData((cur) => ({
            ...cur,
            items: cur.items.map((v) => (v.id === selectedVendor?.id ? { ...v, imageUrl: url } : v)),
          }));
        }}
      />

      {showAddModal && (
        <AddVendorModal
          onClose={() => { setShowAddModal(false); loadVendors({ page: data.pagination.page }); }}
          onCreated={() => { loadVendors({ page: 1 }); notify("Vendor created successfully."); }}
          notify={notify}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete vendor?"
          message={`This will permanently delete "${confirmDelete.name}" along with its reviews, bookmarks, and storefront image. This can't be undone.`}
          busy={deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmDeleteGalleryUrl && (
        <ConfirmDialog
          title="Delete gallery photo?"
          message="Are you sure you want to delete this gallery photo? It won't be permanently removed until you save your changes."
          busy={false}
          onConfirm={async () => {
            setPendingGalleryDeletes((cur) => new Set(cur).add(confirmDeleteGalleryUrl));
            setConfirmDeleteGalleryUrl(null);
          }}
          onCancel={() => setConfirmDeleteGalleryUrl(null)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title={`Delete ${confirmBulkDelete.ids.length} vendor${confirmBulkDelete.ids.length === 1 ? "" : "s"}?`}
          message="This will permanently delete the selected vendors along with their reviews, bookmarks, and storefront images. This can't be undone."
          busy={bulkBusy}
          onConfirm={() => bulkDelete(confirmBulkDelete)}
          onCancel={() => setConfirmBulkDelete(null)}
        />
      )}

      {showDuplicatesPanel && (
        <DuplicatesPanel
          groups={duplicateGroups}
          onClose={() => setShowDuplicatesPanel(false)}
          onDeleteRequest={(id) => {
            const vendor = duplicateGroups.flatMap((group) => [group.a, group.b]).find((entry) => entry.id === id);
            setDupDelete({ id, name: vendor?.vendor_name || "this vendor" });
          }}
        />
      )}

      {dupDelete && (
        <ConfirmDialog
          title="Delete vendor?"
          message={`This will permanently delete "${dupDelete.name}" along with its reviews, bookmarks, and storefront image. This can't be undone.`}
          busy={dupDeleting}
          onConfirm={() => handleDeleteDuplicateVendor(dupDelete)}
          onCancel={() => setDupDelete(null)}
        />
      )}

      {statusConfirmation && (() => {
        const label = statusConfirmation.status === "active" ? "Approve" : statusConfirmation.status === "suspended" ? "Suspend" : "Set Draft";
        const count = statusConfirmation.ids.length;
        const subject = statusConfirmation.bulk
          ? `${count} selected vendor${count === 1 ? "" : "s"}`
          : `"${statusConfirmation.names[0]}"`;
        const effect = statusConfirmation.status === "active"
          ? "They will become active and visible in public listings."
          : statusConfirmation.status === "suspended"
            ? "They will be removed from public listings."
            : "They will be saved as drafts and removed from public listings.";
        return <ConfirmDialog
          title={`${label} ${statusConfirmation.bulk ? `${count} vendor${count === 1 ? "" : "s"}` : "vendor"}?`}
          message={`${label} ${subject}? ${effect}`}
          confirmLabel={label}
          tone={statusConfirmation.status === "suspended" ? "danger" : "primary"}
          onConfirm={() => executeStatusConfirmation(statusConfirmation)}
          onCancel={() => setStatusConfirmation(null)}
        />;
      })()}

      {saveConfirmation && (
        <ConfirmDialog
          title="Save changes?"
          message={`Save the changes to "${saveConfirmation.vendor.name}"?`}
          confirmLabel="Save Changes"
          tone="primary"
          busy={saving}
          onConfirm={() => executeSave(saveConfirmation)}
          onCancel={() => setSaveConfirmation(null)}
        />
      )}

      <Toast toast={toast} />
    </section>
  );

  return content;
}
