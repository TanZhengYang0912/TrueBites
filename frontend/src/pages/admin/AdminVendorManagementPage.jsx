import { AlertTriangle, Ban, Check, Eye, ImagePlus, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  createAdminVendor, deleteAdminVendor, deleteVendorGalleryImage, getAdminVendorDuplicates,
  getAdminVendors, updateAdminVendor, uploadVendorGalleryImage, uploadVendorImage,
} from "../../api/admin";
import Toast from "../../components/engagement/Toast";
import { useToast } from "../../lib/useToast";
import { placeholderImage } from "../../lib/vendorDisplay";

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
  score: ["score_asc", "score_desc"],
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

  if (!form.address.trim()) errors.address = "Address is required.";

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

  const phone = form.phone.trim();
  if (!phone) errors.phone = "Contact number is required.";
  else if (!PHONE_RE.test(phone.replace(/[\s-]/g, ""))) errors.phone = "Invalid Malaysian number, e.g. 06-283 1234.";

  if (form.openSlot === form.closeSlot) errors.hours = "Opening and closing time can't be the same.";

  return errors;
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

// Table-row thumbnail — uses the SAME resolver as the public site
// (placeholderImage), so admin sees exactly what a user would see: the real
// storefront photo if one's been uploaded, else the curated food-photo
// manifest, else a category stock photo. Resets its error flag whenever
// imageUrl changes so a freshly-uploaded photo always gets a fresh load
// attempt instead of getting stuck on a stale failure.
function VendorThumb({ vendor }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [vendor.imageUrl]);

  const src = placeholderImage({
    id: vendor.id,
    name: vendor.name,
    storefront_image_url: errored ? null : vendor.imageUrl,
    cuisine_types: vendor.category,
    signature_dishes: vendor.dishes?.join(", "),
  });

  return (
    <img
      src={src}
      alt=""
      className="admin-table-thumb"
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
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
// Each add/remove hits the server immediately (no "Save" step, matching how
// the cover-image dropzone itself uploads on file pick) and reports the
// server's authoritative gallery_image_urls back up through `onChange`.
function GalleryManager({ vendorId, images, disabled, onChange, notify }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [galleryError, setGalleryError] = useState("");

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
      onChange(gallery_image_urls);
    } catch (err) {
      notify?.(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (url) => {
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

  return (
    <label>
      <span>Gallery Photos ({images.length}/{MAX_GALLERY_IMAGES})</span>
      <div className="admin-gallery-grid">
        {images.map((url) => (
          <div className="admin-gallery-thumb" key={url}>
            <img src={url} alt="" loading="lazy" />
            {!disabled && (
              <button
                type="button"
                className="admin-gallery-thumb-remove"
                onClick={() => removeImage(url)}
                disabled={busy}
                aria-label="Remove photo"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {!disabled && images.length < MAX_GALLERY_IMAGES && (
          <button
            type="button"
            className="admin-gallery-add"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus size={16} />
            <span>{busy ? "Uploading…" : "Add"}</span>
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
  );
}

// Free address autocomplete on the Address field, restricted to Melaka —
// backed by Photon (https://photon.komoot.io), a keyless public search API
// over OpenStreetMap data. No billing account, no API key, cannot incur cost
// (unlike the Google Places Autocomplete this replaces, which stopped working
// once this project's Google Cloud billing got disabled). Picking a
// suggestion fires the standard form `onChange` three times (address,
// latitude, longitude), so lat/lng auto-fill through the exact same plumbing
// every other field uses — no extra prop wiring. Degrades gracefully to a
// plain text input if Photon is unreachable (offline, etc).
function AddressAutocomplete({ form, error, onChange, disabled }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleInput(e) {
    onChange(e);
    const value = e.target.value;
    clearTimeout(debounceRef.current);
    if (value.trim().length < 3) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      try {
        const params = new URLSearchParams({
          q: value,
          limit: "5",
          lat: "2.1896",
          lon: "102.2501",
          bbox: `${MELAKA_BOUNDS.lngMin},${MELAKA_BOUNDS.latMin},${MELAKA_BOUNDS.lngMax},${MELAKA_BOUNDS.latMax}`,
        });
        const res = await fetch(`https://photon.komoot.io/api/?${params}`);
        const data = await res.json();
        if (seq !== requestSeq.current) return; // a newer keystroke already superseded this request
        setSuggestions(data.features || []);
        setOpen(true);
      } catch {
        if (seq === requestSeq.current) setSuggestions([]);
      }
    }, 350);
  }

  function pick(feature) {
    const p = feature.properties;
    const label = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(", ");
    const [lng, lat] = feature.geometry.coordinates;
    setOpen(false);
    setSuggestions([]);
    onChange({ target: { name: "address", value: label } });
    onChange({ target: { name: "latitude", value: String(lat) } });
    onChange({ target: { name: "longitude", value: String(lng) } });
  }

  return (
    <label ref={boxRef} className="admin-address-field">
      <span>Address</span>
      <input
        name="address"
        value={form.address}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        disabled={disabled}
        placeholder="Start typing a Melaka address…"
        autoComplete="off"
      />
      {!disabled && <span className="admin-field-hint">Pick a suggestion to auto-fill the map coordinates.</span>}
      {open && suggestions.length > 0 && (
        <ul className="admin-address-suggestions">
          {suggestions.map((feature, i) => {
            const p = feature.properties;
            const label = [p.name, p.street, p.city, p.state].filter(Boolean).join(", ");
            return (
              <li key={`${p.osm_type}-${p.osm_id}-${i}`}>
                <button type="button" onClick={() => pick(feature)}>{label}</button>
              </li>
            );
          })}
        </ul>
      )}
      <FieldError message={error} />
    </label>
  );
}

// Shared by the Add Vendor modal, the Edit form, AND the read-only View —
// `disabled` greys every control out for View, without duplicating markup.
function VendorFormFields({ form, errors, onChange, onFileChange, disabled }) {
  return (
    <>
      <label>
        <span>Name</span>
        <input name="vendor_name" value={form.vendor_name} onChange={onChange} disabled={disabled} placeholder="e.g. Cendol Pak Hj Ramli" />
        <FieldError message={errors?.vendor_name} />
      </label>

      <AddressAutocomplete form={form} error={errors?.address} onChange={onChange} disabled={disabled} />

      <div className="admin-modal-grid">
        <label>
          <span>Latitude</span>
          <input type="number" step="any" name="latitude" value={form.latitude} onChange={onChange} disabled={disabled} placeholder="2.1946" />
          <FieldError message={errors?.latitude} />
        </label>
        <label>
          <span>Longitude</span>
          <input type="number" step="any" name="longitude" value={form.longitude} onChange={onChange} disabled={disabled} placeholder="102.2485" />
          <FieldError message={errors?.longitude} />
        </label>
      </div>

      <div className="admin-modal-grid admin-modal-grid-3">
        <label>
          <span>Category</span>
          <select name="cuisine_types" value={form.cuisine_types} onChange={onChange} disabled={disabled}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>
          <span>Price Range (RM / Person)</span>
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
        <span>Signature Dishes</span>
        <input name="signature_dishes" value={form.signature_dishes} onChange={onChange} disabled={disabled} placeholder="Comma-separated e.g. Cendol, Ice Kacang" />
        <FieldError message={errors?.signature_dishes} />
      </label>

      <div className="admin-modal-grid">
        <label>
          <span>Phone</span>
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

      <ImageDropzone form={form} onFileChange={onFileChange} disabled={disabled} />
    </>
  );
}

// A real confirmation dialog for destructive actions — replaces the cramped
// inline "Delete? Yes / No" that used to sit inside the table row / bulk bar.
function ConfirmDialog({ title, message, confirmLabel = "Delete", busy, onConfirm, onCancel }) {
  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal-card admin-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>{title}</h2>
        </div>
        <div className="admin-modal-form">
          <p className="admin-confirm-message">{message}</p>
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="admin-primary-btn compact danger" onClick={onConfirm} disabled={busy}>
              {busy ? "…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
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

function VendorDetailModal({ vendor, editing, form, errors, saving, error, onClose, onChange, onFileChange, onStartEdit, onCancelEdit, onSave, onGalleryChange, notify }) {
  if (!vendor) return null;

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{editing ? "Edit Vendor" : vendor.name}</h2>
          </div>
          <button type="button" className="admin-icon-btn subtle" onClick={onClose}>×</button>
        </div>

        <div className="admin-modal-form">
          <VendorFormFields form={form} errors={editing ? errors : null} onChange={onChange} onFileChange={onFileChange} disabled={!editing} />

          <GalleryManager
            vendorId={vendor.id}
            images={vendor.galleryUrls || []}
            disabled={!editing}
            onChange={onGalleryChange}
            notify={notify}
          />

          {!editing && (
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--admin-muted)" }}>
              <span>Source: {vendor.sourcePlatform}</span>
              <span>Location: {vendor.locationPrecision || "Unknown"}</span>
              <span>AI Score: {vendor.aiScore ? Number(vendor.aiScore).toFixed(1) : "—"}</span>
            </div>
          )}

          {error && <div className="admin-feedback error">{error}</div>}

          <div className="admin-modal-actions">
            {editing ? (
              <>
                <button type="button" className="admin-secondary-btn compact" onClick={onCancelEdit}>Cancel</button>
                <button type="button" className="admin-primary-btn compact" onClick={onSave} disabled={saving}>
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

function AddVendorModal({ onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Set when the server flags a fuzzy name/address match (409
  // possible_duplicate) — shown as a warning with an "Add anyway" override
  // instead of silently blocking, since same-named vendors do legitimately exist.
  const [duplicates, setDuplicates] = useState(null);

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
  });

  const doSave = async (force) => {
    setSaving(true);
    setError("");
    try {
      const created = await createAdminVendor({ ...buildPayload(), force });
      if (form.imageFile && created?.id) {
        await uploadVendorImage(created.id, form.imageFile);
      }
      onCreated();
      onClose();
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
    if (Object.keys(errs).length) return;
    doSave(false);
  };

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
          <VendorFormFields form={form} errors={errors} onChange={handleChange} onFileChange={handleFileChange} disabled={false} />
          {error && <div className="admin-feedback error">{error}</div>}
          {duplicates && (
            <div className="admin-feedback warning">
              <strong>⚠ Possible duplicate{duplicates.length > 1 ? "s" : ""} found:</strong>
              <ul className="admin-duplicate-list">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {d.vendor_name}{d.address ? ` — ${d.address}` : ""}
                    <span className="admin-duplicate-score"> ({Math.round(d.match_score * 100)}% match)</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="admin-secondary-btn compact" onClick={() => doSave(true)} disabled={saving}>
                {saving ? "Adding…" : "Add anyway"}
              </button>
            </div>
          )}
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [toast, notify] = useToast();
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [showDuplicatesPanel, setShowDuplicatesPanel] = useState(false);
  const [dupDeleteId, setDupDeleteId] = useState(null);
  const [dupDeleting, setDupDeleting] = useState(false);

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

  // Real-time search — debounce like VendorsPage.jsx, no Enter/submit needed.
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
    setConfirmBulkDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.pagination.page, status, category, sort, query, pageSize]);

  const resetToFirstPage = () => setData((cur) => ({ ...cur, pagination: { ...cur.pagination, page: 1 } }));

  const openVendor = (vendor) => {
    setSelectedVendor(vendor);
    setEditing(false);
    setError("");
    setErrors({});
    setForm(makeForm(vendor));
  };

  const handlePageChange = (page) => {
    setData((cur) => ({ ...cur, pagination: { ...cur.pagination, page } }));
  };

  const handleSave = async () => {
    if (!selectedVendor) return;
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setError("");
    try {
      await updateAdminVendor(selectedVendor.id, {
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
      });
      if (form.imageFile) {
        await uploadVendorImage(selectedVendor.id, form.imageFile);
      }
      const refreshed = await getAdminVendors({ page: data.pagination.page, pageSize, status, category, sort, q: query });
      setData(refreshed);
      // Saving closes the modal outright — same reasoning as Cancel, it
      // shouldn't drop back into the read-only View screen.
      setSelectedVendor(null);
      setEditing(false);
      notify("Vendor updated successfully.");
    } catch (err) {
      setError(err.message);
      notify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await deleteAdminVendor(id);
      setConfirmDeleteId(null);
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
  const handleDeleteDuplicateVendor = async (id) => {
    setDupDeleting(true);
    try {
      await deleteAdminVendor(id);
      setDupDeleteId(null);
      setDuplicateGroups((groups) => groups.filter((g) => g.a.id !== id && g.b.id !== id));
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
  const handleQuickStatus = async (id, newStatus) => {
    setError("");
    try {
      await updateAdminVendor(id, { status: newStatus });
      await refreshList();
      notify(`Vendor ${newStatus === "active" ? "approved" : newStatus}.`);
    } catch (err) {
      setError(err.message);
      notify(err.message, true);
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

  const bulkSetStatus = async (newStatus) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    setError("");
    try {
      await Promise.all(ids.map((id) => updateAdminVendor(id, { status: newStatus })));
      setSelectedIds(new Set());
      await refreshList();
      notify(`${ids.length} vendor${ids.length === 1 ? "" : "s"} updated.`);
    } catch (err) {
      setError(err.message);
      notify(err.message, true);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    setError("");
    try {
      await Promise.all(ids.map((id) => deleteAdminVendor(id)));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      await refreshList();
      notify(`${ids.length} vendor${ids.length === 1 ? "" : "s"} deleted.`);
    } catch (err) {
      setError(err.message);
      notify(err.message, true);
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
    <section className="admin-vendors-page">
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={15} />
          <input
            value={draftQuery}
            onChange={(e) => { setDraftQuery(e.target.value); resetToFirstPage(); }}
            placeholder="Search Vendors, Categories, Dishes…"
          />
        </div>

        <div className="admin-filter-cluster">
          <select value={category} onChange={(e) => { setCategory(e.target.value); resetToFirstPage(); }}>
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); resetToFirstPage(); }}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All Statuses" : s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); resetToFirstPage(); }}>
            {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {duplicateGroups.length > 0 && (
          <button type="button" className="admin-duplicates-badge" onClick={() => setShowDuplicatesPanel(true)}>
            <AlertTriangle size={13} />
            {duplicateGroups.length} possible duplicate{duplicateGroups.length > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {error ? (
        <div className="admin-feedback error admin-feedback-row">
          <span>{error}</span>
          <button type="button" className="admin-secondary-btn compact" onClick={() => loadVendors()}>Retry</button>
        </div>
      ) : null}

      {selectedIds.size > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-count">{selectedIds.size} selected</span>
          <div className="admin-bulk-actions">
            <button type="button" className="admin-secondary-btn compact" disabled={bulkBusy} onClick={() => bulkSetStatus("active")}>
              <Check size={14} /> Approve
            </button>
            <button type="button" className="admin-secondary-btn compact" disabled={bulkBusy} onClick={() => bulkSetStatus("draft")}>
              Set Draft
            </button>
            <button type="button" className="admin-secondary-btn compact" disabled={bulkBusy} onClick={() => bulkSetStatus("suspended")}>
              <Ban size={14} /> Suspend
            </button>
            <button type="button" className="admin-secondary-btn compact danger" disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}>
              <Trash2 size={14} /> Delete
            </button>
            <button type="button" className="admin-link-btn" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        </div>
      )}

      <section className="admin-panel admin-table-panel">
        <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-th-check">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all vendors on this page"
                />
              </th>
              <th>Image</th>
              <th aria-sort={ariaSortFor("vendor")}>
                <button type="button" className="admin-th-sort" onClick={() => handleHeaderSort("vendor")}>
                  Vendor <span className="admin-sort-caret">{sortIndicator("vendor")}</span>
                </button>
              </th>
              <th aria-sort={ariaSortFor("category")}>
                <button type="button" className="admin-th-sort" onClick={() => handleHeaderSort("category")}>
                  Category <span className="admin-sort-caret">{sortIndicator("category")}</span>
                </button>
              </th>
              <th>Hours</th>
              <th aria-sort={ariaSortFor("status")}>
                <button type="button" className="admin-th-sort" onClick={() => handleHeaderSort("status")}>
                  Status <span className="admin-sort-caret">{sortIndicator("status")}</span>
                </button>
              </th>
              <th aria-sort={ariaSortFor("score")}>
                <button type="button" className="admin-th-sort" onClick={() => handleHeaderSort("score")}>
                  AI Score <span className="admin-sort-caret">{sortIndicator("score")}</span>
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
                <tr key={`sk-${i}`} className="admin-skeleton-row">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><div className="admin-skeleton-bar" /></td>
                  ))}
                </tr>
              ))
            ) : data.items.length ? (
              data.items.map((vendor) => {
                const st = vendor.status.toLowerCase();
                return (
                <tr
                  key={vendor.id}
                  className={selectedIds.has(vendor.id) ? "is-selected" : ""}
                  onClick={() => openVendor(vendor)}
                >
                  <td className="admin-td-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(vendor.id)}
                      onChange={() => toggleSelect(vendor.id)}
                      aria-label={`Select ${vendor.name}`}
                    />
                  </td>
                  <td>
                    <VendorThumb vendor={vendor} />
                  </td>
                  <td><strong>{vendor.name}</strong></td>
                  <td>{vendor.category}</td>
                  <td>{vendor.operatingHours || <span className="admin-dash">—</span>}</td>
                  <td>
                    <span className={`admin-status-pill ${st}`}>
                      {vendor.status}
                    </span>
                  </td>
                  <td className="admin-table-score">
                    {vendor.aiScore ? (
                      <>
                        <Star size={13} fill="currentColor" />
                        <span>{Number(vendor.aiScore).toFixed(1)}</span>
                      </>
                    ) : (
                      <span className="admin-dash">—</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="admin-table-actions">
                      {st !== "active" && (
                        <button type="button" className="approve" onClick={() => handleQuickStatus(vendor.id, "active")} aria-label={`Approve ${vendor.name}`} title="Approve">
                          <Check size={15} />
                        </button>
                      )}
                      {st === "active" && (
                        <button type="button" onClick={() => handleQuickStatus(vendor.id, "suspended")} aria-label={`Suspend ${vendor.name}`} title="Suspend">
                          <Ban size={15} />
                        </button>
                      )}
                      <button type="button" onClick={() => openVendor(vendor)} aria-label={`View ${vendor.name}`}>
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { openVendor(vendor); setEditing(true); }}
                        aria-label={`Edit ${vendor.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setConfirmDeleteId(vendor.id)}
                        aria-label={`Delete ${vendor.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8">
                  <div className="admin-empty-state">
                    <p>No vendors matched this filter.</p>
                    <div className="admin-empty-actions">
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

      <VendorDetailModal
        vendor={selectedVendor}
        editing={editing}
        form={form}
        errors={errors}
        saving={saving}
        error={error}
        onClose={() => setSelectedVendor(null)}
        onStartEdit={() => {
          if (selectedVendor) setForm(makeForm(selectedVendor));
          setErrors({});
          setError("");
          setEditing(true);
        }}
        onCancelEdit={() => {
          // Cancelling out of Edit closes the modal outright — it shouldn't
          // drop back into the read-only View screen the admin never asked for.
          setErrors({});
          setError("");
          setSelectedVendor(null);
          setEditing(false);
        }}
        onChange={(e) => {
          const { name, value } = e.target;
          setForm((cur) => ({ ...cur, [name]: value }));
        }}
        onFileChange={(file) => setForm((cur) => ({ ...cur, imageFile: file }))}
        onSave={handleSave}
        notify={notify}
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
      />

      {showAddModal && (
        <AddVendorModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { loadVendors({ page: 1 }); notify("Vendor created successfully."); }}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete vendor?"
          message={`This will permanently delete "${data.items.find((v) => v.id === confirmDeleteId)?.name || "this vendor"}" along with its reviews, bookmarks, and storefront image. This can't be undone.`}
          busy={deleting}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} vendor${selectedIds.size === 1 ? "" : "s"}?`}
          message="This will permanently delete the selected vendors along with their reviews, bookmarks, and storefront images. This can't be undone."
          busy={bulkBusy}
          onConfirm={bulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}

      {showDuplicatesPanel && (
        <DuplicatesPanel
          groups={duplicateGroups}
          onClose={() => setShowDuplicatesPanel(false)}
          onDeleteRequest={setDupDeleteId}
        />
      )}

      {dupDeleteId && (
        <ConfirmDialog
          title="Delete vendor?"
          message={`This will permanently delete "${
            duplicateGroups.flatMap((g) => [g.a, g.b]).find((v) => v.id === dupDeleteId)?.vendor_name || "this vendor"
          }" along with its reviews, bookmarks, and storefront image. This can't be undone.`}
          busy={dupDeleting}
          onConfirm={() => handleDeleteDuplicateVendor(dupDeleteId)}
          onCancel={() => setDupDeleteId(null)}
        />
      )}

      <Toast toast={toast} />
    </section>
  );

  return content;
}
