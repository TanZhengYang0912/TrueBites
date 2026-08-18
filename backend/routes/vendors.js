import { Router } from "express";
import express from "express";
import { supabase } from "../supabase.js";
import { requireRole } from "../middleware/requireRole.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { logActivity } from "../lib/auditLog.js";
import {
  STORAGE_BUCKET,
  VENDOR_STATUSES,
  validateVendor,
  storagePathFromUrl,
} from "../lib/vendorValidation.js";
const router = Router();

// Reads stay public (they feed the discovery UI); writes require an admin
// with the "vendors" permission (see lib/permissions.js).
const adminOnly = [requireRole("admin", "superadmin"), requirePermission("vendors")];

// ─────────────────────────────────────────────────────────────────────────────
// VENDORS MODULE — Toh Lian Thing
// Add vendor-related routes here (list vendors, vendor details, etc.)
// ─────────────────────────────────────────────────────────────────────────────

// One-time Supabase setup (SQL editor + Storage):
//   alter table vendors add column if not exists status text not null default 'draft';
//   alter table vendors add column if not exists phone text;
//   alter table vendors add column if not exists storefront_image_url text;
//   -- Storage: create a PUBLIC bucket named "vendor-images"
//   -- (uploads go through this server with the service key, so no extra
//   --  storage policies are needed beyond public read).
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
      "id, vendor_name, address, state, latitude, longitude, cuisine_types, operating_hours_raw, price_range, phone, status, storefront_image_url, average_rating, review_count",
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

    const { error: updateErr } = await supabase
      .from("vendors")
      .update({ storefront_image_url: publicUrl })
      .eq("id", vendor.id);
    if (updateErr) {
      return res.status(500).json({ error: "database update failed", details: updateErr.message });
    }

    const oldPath = storagePathFromUrl(vendor.storefront_image_url);
    if (oldPath && oldPath !== filePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([oldPath]);
    }

    await logActivity({ actor: req.callerUser, action: "vendor.image_upload", entityType: "vendor", entityId: vendor.id });
    res.status(201).json({ storefront_image_url: publicUrl });
  }
);

router.delete("/vendors/:id", adminOnly, async (req, res) => {
  const { data: vendor, error: findErr } = await supabase
    .from("vendors")
    .select("id, storefront_image_url")
    .eq("id", req.params.id)
    .single();
  if (findErr || !vendor) return res.status(404).json({ error: "vendor not found" });

  const { error } = await supabase.from("vendors").delete().eq("id", req.params.id);
  if (error) {
    return res.status(500).json({ error: "database delete failed", details: error.message });
  }

  const imagePath = storagePathFromUrl(vendor.storefront_image_url);
  if (imagePath) {
    await supabase.storage.from(STORAGE_BUCKET).remove([imagePath]);
  }

  await logActivity({ actor: req.callerUser, action: "vendor.delete", entityType: "vendor", entityId: vendor.id });
  res.json({ deleted: true, id: vendor.id });
});

export default router;