import { Router } from "express";
import express from "express";
import { supabase } from "../supabase.js";
import { requireRole } from "../middleware/requireRole.js";
import { logActivity } from "../lib/auditLog.js";
import {
  STORAGE_BUCKET,
  VENDOR_STATUSES,
  MAX_GALLERY_IMAGES,
  validateVendor,
  storagePathFromUrl,
} from "../lib/vendorValidation.js";
import { discoverVendorPhotos, describeManualUpload, downloadAndStorePhoto } from "../lib/photoProviders/index.js";
const router = Router();

// Best-effort metadata write — a vendor_photos insert failing (e.g. the
// migration above hasn't been run yet) must never break the actual upload it
// describes, so failures are logged and swallowed, same convention as
// lib/auditLog.js. `ignoreDuplicates` makes this idempotent against the
// (vendor_id, url) unique constraint.
async function recordVendorPhoto({ vendorId, url, storagePath, role, source, provider, confidence = null, matchMeta = null }) {
  try {
    await supabase.from("vendor_photos").upsert(
      { vendor_id: vendorId, url, storage_path: storagePath || null, role, source, provider, confidence, match_meta: matchMeta },
      { onConflict: "vendor_id,url", ignoreDuplicates: true }
    );
  } catch (err) {
    console.error("vendor_photos insert failed:", err.message);
  }
}

// Reads stay public (they feed the discovery UI); writes require an admin.
const adminOnly = [requireRole("admin")];

// ─────────────────────────────────────────────────────────────────────────────
// VENDORS MODULE — Toh Lian Thing
// Add vendor-related routes here (list vendors, vendor details, etc.)
// ─────────────────────────────────────────────────────────────────────────────

// One-time Supabase setup (SQL editor + Storage):
//   alter table vendors add column if not exists status text not null default 'draft';
//   alter table vendors add column if not exists phone text;
//   alter table vendors add column if not exists storefront_image_url text;
//   alter table vendors add column if not exists gallery_image_urls jsonb not null default '[]'::jsonb;
//   -- Storage: create a PUBLIC bucket named "vendor-images"
//   -- (uploads go through this server with the service key, so no extra
//   --  storage policies are needed beyond public read).
//
// `storefront_image_url` stays the single cover photo (unchanged contract).
// `gallery_image_urls` is a JSON array of extra photo URLs (food/interior
// shots) rendered after the cover in the card-hover / detail-modal carousels
// — see /vendors/:id/gallery below.
//
// Vendor photo sourcing/discovery (added for /photos/discover + /photos/commit
// below — one more one-time SQL editor step, additive, safe to run alongside
// existing data):
//   alter table vendors add column if not exists cover_photo_source text;      -- 'manual' | 'external_api' | 'fallback'
//   alter table vendors add column if not exists cover_photo_provider text;    -- 'manual_upload' | 'tiktok_oembed' | null
//   alter table vendors add column if not exists cover_photo_confidence int;   -- 0-100, null for manual
//   alter table vendors add column if not exists cover_photo_locked boolean not null default false;
//
//   create table if not exists vendor_photos (
//     id uuid primary key default gen_random_uuid(),
//     vendor_id uuid references vendors(id) on delete cascade,
//     url text not null,
//     storage_path text,
//     role text check (role in ('cover','gallery')),
//     source text check (source in ('manual','external_api','fallback')),
//     provider text,
//     confidence int,
//     match_meta jsonb,
//     created_at timestamptz default now(),
//     unique (vendor_id, url)
//   );
//
// `gallery_image_urls`/`storefront_image_url` stay the single source of truth
// for what renders on the public site (zero changes there); `vendor_photos`
// only carries per-photo source/confidence metadata for the admin panel and
// the commit endpoint's duplicate check. `cover_photo_locked=true` (set the
// moment an admin manually uploads a cover) is what makes "manual always
// wins" a database fact — /photos/commit refuses to touch a locked cover.
// ─────────────────────────────────────────────────────────────────────────────

const sanitizeTerm = (t) => String(t).replace(/[,()]/g, " ").trim();

router.get("/vendors", async (req, res) => {
  const { q, cuisine, location, hours, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const from = (page - 1) * limit;

  let query = supabase
    .from("vendors")
    .select(
      "id, vendor_name, address, state, latitude, longitude, cuisine_types, operating_hours_raw, price_range, phone, status, storefront_image_url, gallery_image_urls, average_rating, review_count",
      { count: "exact" }
    );

  if (q) query = query.ilike("vendor_name", `%${sanitizeTerm(q)}%`);
  if (cuisine) query = query.ilike("cuisine_types", `%${sanitizeTerm(cuisine)}%`);
  if (hours) query = query.ilike("operating_hours_raw", `%${sanitizeTerm(hours)}%`);
  if (status && VENDOR_STATUSES.includes(String(status).toLowerCase())) {
    query = query.eq("status", String(status).toLowerCase());
  }
  if (location) {
    const term = sanitizeTerm(location);
    query = query.or(`address.ilike.%${term}%,state.ilike.%${term}%`);
  }

  const { data, error, count } = await query
    .order("vendor_name", { ascending: true })
    .range(from, from + limit - 1);

  if (error) {
    return res.status(500).json({ error: "database query failed", details: error.message });
  }
  res.json({ vendors: data, total: count ?? 0, page, limit });
});

router.get("/vendors/meta", async (_req, res) => {
  const { data, error } = await supabase
    .from("vendors")
    .select("cuisine_types, state, status");

  if (error) {
    return res.status(500).json({ error: "database query failed", details: error.message });
  }

  const cuisines = new Set();
  const states = new Set();
  const statusCounts = { draft: 0, active: 0, suspended: 0 };
  for (const row of data) {
    (row.cuisine_types || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c) => cuisines.add(c));
    if (row.state) states.add(row.state.trim());
    const s = (row.status || "draft").toLowerCase();
    if (s in statusCounts) statusCounts[s]++;
  }

  res.json({
    cuisines: [...cuisines].sort((a, b) => a.localeCompare(b)),
    states: [...states].sort((a, b) => a.localeCompare(b)),
    statusCounts,
    total: data.length,
  });
});

router.get("/vendors/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "vendor not found", details: error.message });
  res.json(data);
});

router.post("/vendors", adminOnly, async (req, res) => {
  const { errors, clean } = validateVendor(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "validation failed", fields: errors });
  }

  const { data, error } = await supabase
    .from("vendors")
    .insert(clean)
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // unique violation → conflict
    return res.status(status).json({ error: "database insert failed", details: error.message });
  }
  await logActivity({ actor: req.callerUser, action: "vendor.create", entityType: "vendor", entityId: data.id });
  res.status(201).json(data);
});

router.put("/vendors/:id", adminOnly, async (req, res) => {
  const { errors, clean } = validateVendor(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "validation failed", fields: errors });
  }

  const { data, error } = await supabase
    .from("vendors")
    .update(clean)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: "database update failed", details: error.message });
  }
  if (!data) return res.status(404).json({ error: "vendor not found" });
  await logActivity({ actor: req.callerUser, action: "vendor.update", entityType: "vendor", entityId: req.params.id });
  res.json(data);
});

router.patch("/vendors/:id/status", adminOnly, async (req, res) => {
  const status = String(req.body?.status || "").toLowerCase();
  if (!VENDOR_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VENDOR_STATUSES.join(", ")}` });
  }

  // Stamp the first activation only. Re-activating a suspended vendor keeps its
  // original publish date, so it does not resurface as "new" in the bell.
  const { data: current } = await supabase
    .from("vendors")
    .select("published_at")
    .eq("id", req.params.id)
    .maybeSingle();

  const patch = { status };
  if (status === "active" && !current?.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("vendors")
    .update(patch)
    .eq("id", req.params.id)
    .select("id, vendor_name, status, published_at")
    .single();

  if (error) {
    return res.status(500).json({ error: "database update failed", details: error.message });
  }
  await logActivity({ actor: req.callerUser, action: "vendor.status_change", entityType: "vendor", entityId: req.params.id, metadata: { status } });
  res.json(data);
});

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

router.post(
  "/vendors/:id/image",
  adminOnly,
  express.raw({ type: "image/*", limit: "8mb" }),
  async (req, res) => {
    const ext = ALLOWED_IMAGE_TYPES[req.headers["content-type"]];
    if (!ext) {
      return res.status(400).json({ error: "unsupported image type — use JPEG, PNG, WebP or GIF" });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "empty upload — send the raw image as the request body" });
    }

    const { data: vendor, error: findErr } = await supabase
      .from("vendors")
      .select("id, storefront_image_url")
      .eq("id", req.params.id)
      .single();
    if (findErr || !vendor) return res.status(404).json({ error: "vendor not found" });

    const filePath = `vendors/${vendor.id}/storefront-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.body, {
        contentType: req.headers["content-type"],
        cacheControl: "31536000", 
        upsert: false,
      });
    if (uploadErr) {
      return res.status(500).json({ error: "storage upload failed", details: uploadErr.message });
    }

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const publicUrl = pub.publicUrl;

    // A manual upload always wins — locking the cover here is what makes
    // that a database fact: /photos/commit refuses to overwrite a locked
    // cover from the automatic-discovery panel.
    const manual = describeManualUpload();
    const { error: updateErr } = await supabase
      .from("vendors")
      .update({
        storefront_image_url: publicUrl,
        cover_photo_source: manual.source,
        cover_photo_provider: manual.provider,
        cover_photo_confidence: null,
        cover_photo_locked: true,
      })
      .eq("id", vendor.id);
    if (updateErr) {
      return res.status(500).json({ error: "database update failed", details: updateErr.message });
    }
    await recordVendorPhoto({ vendorId: vendor.id, url: publicUrl, storagePath: filePath, role: "cover", ...manual });

    const oldPath = storagePathFromUrl(vendor.storefront_image_url);
    if (oldPath && oldPath !== filePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([oldPath]);
    }

    await logActivity({ actor: req.callerUser, action: "vendor.image_upload", entityType: "vendor", entityId: vendor.id });
    res.status(201).json({ storefront_image_url: publicUrl });
  }
);

// Gallery photos — additional shots (food/interior) shown after the cover in
// the hover/autoplay carousels. Unlike the cover-image endpoint above, this
// APPENDS and never deletes a previous object on upload; each photo is
// removed individually via the DELETE route below.
router.post(
  "/vendors/:id/gallery",
  adminOnly,
  express.raw({ type: "image/*", limit: "8mb" }),
  async (req, res) => {
    const ext = ALLOWED_IMAGE_TYPES[req.headers["content-type"]];
    if (!ext) {
      return res.status(400).json({ error: "unsupported image type — use JPEG, PNG, WebP or GIF" });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "empty upload — send the raw image as the request body" });
    }

    const { data: vendor, error: findErr } = await supabase
      .from("vendors")
      .select("id, gallery_image_urls")
      .eq("id", req.params.id)
      .single();
    if (findErr || !vendor) return res.status(404).json({ error: "vendor not found" });

    const existing = Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [];
    if (existing.length >= MAX_GALLERY_IMAGES) {
      return res.status(400).json({ error: `a vendor can have at most ${MAX_GALLERY_IMAGES} gallery photos — remove one first` });
    }

    const filePath = `vendors/${vendor.id}/gallery-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.body, {
        contentType: req.headers["content-type"],
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadErr) {
      return res.status(500).json({ error: "storage upload failed", details: uploadErr.message });
    }

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const gallery_image_urls = [...existing, pub.publicUrl];

    const { error: updateErr } = await supabase
      .from("vendors")
      .update({ gallery_image_urls })
      .eq("id", vendor.id);
    if (updateErr) {
      return res.status(500).json({ error: "database update failed", details: updateErr.message });
    }
    await recordVendorPhoto({ vendorId: vendor.id, url: pub.publicUrl, storagePath: filePath, role: "gallery", ...describeManualUpload() });

    await logActivity({ actor: req.callerUser, action: "vendor.gallery_image_add", entityType: "vendor", entityId: vendor.id });
    res.status(201).json({ gallery_image_urls });
  }
);

router.delete("/vendors/:id/gallery", adminOnly, async (req, res) => {
  const url = String(req.body?.url || req.query.url || "");
  if (!url) return res.status(400).json({ error: "url is required" });

  const { data: vendor, error: findErr } = await supabase
    .from("vendors")
    .select("id, gallery_image_urls")
    .eq("id", req.params.id)
    .single();
  if (findErr || !vendor) return res.status(404).json({ error: "vendor not found" });

  const existing = Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [];
  const gallery_image_urls = existing.filter((u) => u !== url);
  if (gallery_image_urls.length === existing.length) {
    return res.status(404).json({ error: "that photo isn't in this vendor's gallery" });
  }

  const { error: updateErr } = await supabase
    .from("vendors")
    .update({ gallery_image_urls })
    .eq("id", vendor.id);
  if (updateErr) {
    return res.status(500).json({ error: "database update failed", details: updateErr.message });
  }

  const path = storagePathFromUrl(url);
  if (path) await supabase.storage.from(STORAGE_BUCKET).remove([path]);

  await logActivity({ actor: req.callerUser, action: "vendor.gallery_image_remove", entityType: "vendor", entityId: vendor.id });
  res.json({ gallery_image_urls });
});

// Automatic photo discovery — never called except by an explicit admin
// click (see PhotoDiscoveryPanel.jsx). Preview-only: no photo bytes are
// downloaded here, only enough metadata for the admin to see and judge each
// candidate (see each provider's findCandidates in lib/photoProviders/ for
// why that's safe/cheap). Candidates below NEEDS_CONFIRMATION_THRESHOLD are
// filtered out inside discoverVendorPhotos before this ever runs — the admin
// never sees a low-confidence guess.
router.post("/vendors/:id/photos/discover", adminOnly, async (req, res) => {
  const { data: vendor, error: findErr } = await supabase
    .from("vendors")
    .select("id, vendor_name, address, latitude, longitude, cuisine_types, source_video_url")
    .eq("id", req.params.id)
    .single();
  if (findErr || !vendor) return res.status(404).json({ error: "vendor not found" });

  const lat = Number(vendor.latitude);
  const lng = Number(vendor.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "this vendor has no valid latitude/longitude yet — add coordinates before searching for photos" });
  }
  // Belt-and-braces: the admin panel already disables the search button
  // outside these ranges, but this endpoint must never fire an external
  // request off a bad value reached some other way (direct API call, a
  // stale/corrupted row, etc).
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "Please enter a valid latitude and longitude." });
  }

  const candidates = await discoverVendorPhotos(vendor);
  res.json({ candidates });
});

// Commits ONE chosen candidate: downloads its bytes (deferred until now —
// never for candidates the admin didn't pick), uploads via the same storage
// convention as manual uploads, records vendor_photos metadata.
router.post("/vendors/:id/photos/commit", adminOnly, async (req, res) => {
  const { provider, photoRef, role, confidence, matchMeta } = req.body || {};
  if (!photoRef || !["cover", "gallery"].includes(role)) {
    return res.status(400).json({ error: "provider, photoRef and a role of 'cover' or 'gallery' are required" });
  }

  const { data: vendor, error: findErr } = await supabase
    .from("vendors")
    .select("id, storefront_image_url, gallery_image_urls, cover_photo_locked")
    .eq("id", req.params.id)
    .single();
  if (findErr || !vendor) return res.status(404).json({ error: "vendor not found" });

  if (role === "cover" && vendor.cover_photo_locked) {
    return res.status(409).json({ error: "this vendor's cover photo was set manually and won't be replaced automatically — clear it via a new manual upload first if you want to change it" });
  }
  if (role === "gallery") {
    const existing = Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [];
    if (existing.length >= MAX_GALLERY_IMAGES) {
      return res.status(400).json({ error: `a vendor can have at most ${MAX_GALLERY_IMAGES} gallery photos — remove one first` });
    }
  }

  const KNOWN_PROVIDERS = ["tiktok_oembed", "mapillary", "flickr", "video_frame", "wikimedia"];
  if (!KNOWN_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `unknown or unavailable photo provider: ${provider}` });
  }

  let stored;
  try {
    // Every provider's candidate.photoRef is just a fetchable image URL, so
    // downloading and storing it is identical regardless of source.
    stored = await downloadAndStorePhoto(vendor.id, photoRef, role === "cover" ? "storefront" : "gallery");
  } catch (err) {
    return res.status(502).json({ error: "could not retrieve that photo — it may have expired, try Search Again", details: err.message });
  }

  if (role === "cover") {
    const { error: updateErr } = await supabase
      .from("vendors")
      .update({
        storefront_image_url: stored.url,
        cover_photo_source: "external_api",
        cover_photo_provider: provider,
        cover_photo_confidence: confidence ?? null,
        cover_photo_locked: false,
      })
      .eq("id", vendor.id);
    if (updateErr) return res.status(500).json({ error: "database update failed", details: updateErr.message });

    const oldPath = storagePathFromUrl(vendor.storefront_image_url);
    if (oldPath && oldPath !== stored.storagePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([oldPath]);
    }
  } else {
    const existing = Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [];
    if (existing.includes(stored.url)) {
      return res.status(409).json({ error: "that photo is already in this vendor's gallery" });
    }
    const gallery_image_urls = [...existing, stored.url];
    const { error: updateErr } = await supabase.from("vendors").update({ gallery_image_urls }).eq("id", vendor.id);
    if (updateErr) return res.status(500).json({ error: "database update failed", details: updateErr.message });
  }

  await recordVendorPhoto({
    vendorId: vendor.id, url: stored.url, storagePath: stored.storagePath, role,
    source: "external_api", provider, confidence: confidence ?? null, matchMeta: matchMeta ?? null,
  });
  await logActivity({ actor: req.callerUser, action: "vendor.photo_discover_commit", entityType: "vendor", entityId: vendor.id, metadata: { provider, role, confidence } });

  res.status(201).json({ url: stored.url, role });
});

router.delete("/vendors/:id", adminOnly, async (req, res) => {
  const { data: vendor, error: findErr } = await supabase
    .from("vendors")
    .select("id, storefront_image_url, gallery_image_urls")
    .eq("id", req.params.id)
    .single();
  if (findErr || !vendor) return res.status(404).json({ error: "vendor not found" });

  const { error } = await supabase.from("vendors").delete().eq("id", req.params.id);
  if (error) {
    return res.status(500).json({ error: "database delete failed", details: error.message });
  }

  const galleryUrls = Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [];
  const paths = [vendor.storefront_image_url, ...galleryUrls]
    .map(storagePathFromUrl)
    .filter(Boolean);
  if (paths.length) {
    await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  }

  await logActivity({ actor: req.callerUser, action: "vendor.delete", entityType: "vendor", entityId: vendor.id });
  res.json({ deleted: true, id: vendor.id });
});

export default router;