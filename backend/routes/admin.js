import { Router } from "express";
import { supabase } from "../supabase.js";
import fs from "node:fs";
import path from "node:path";
import { recomputeVendorRating } from "./engagement.js";
import {
  STORAGE_BUCKET,
  VENDOR_STATUSES,
  validateVendor,
  validateVendorPatch,
  vendorActivationIssues,
  storagePathFromUrl,
} from "../lib/vendorValidation.js";
import { findDuplicatesFor, findAllDuplicateGroups } from "../lib/vendorDuplicates.js";
import { logActivity } from "../lib/auditLog.js";
import { isSuspended } from "../lib/suspension.js";
import { startProcessingJob } from "../lib/ai/pipeline.js";
import { ytDlp } from "../lib/ai/binaries.js";
import { resolvePublicBaseUrl } from "../lib/publicBaseUrl.js";
import { requireDashboardData } from "../lib/adminDashboardData.js";

const router = Router();

const OUTPUTS_DIR = path.resolve(process.cwd(), "outputs");

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD / VENDORS / AI PROCESSING / SETTINGS / REVIEWS
// The whole /api/admin router is gated by requireRole("admin") in server.js,
// so every handler below can assume the caller is a verified admin.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeStatusFilter(status) {
  if (!status || status === "all") return null;
  if (!VENDOR_STATUSES.includes(status)) return null;
  return [status];
}

function buildVendorSearch(query) {
  const safe = query.replace(/[%(),]/g, " ").trim();
  return [
    `vendor_name.ilike.%${safe}%`,
    `cuisine_types.ilike.%${safe}%`,
    `signature_dishes.ilike.%${safe}%`,
    `address.ilike.%${safe}%`,
    `state.ilike.%${safe}%`,
  ].join(",");
}

function recommendationLabel(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "Needs Review";
  if (n >= 4.5) return "Highly Recommended";
  if (n >= 3.8) return "Recommended";
  if (n >= 3) return "Mixed";
  return "Low Confidence";
}

function platformBadge(url, platform) {
  if (platform) return platform;
  const lower = (url || "").toLowerCase();
  if (lower.includes("tiktok")) return "TikTok";
  if (lower.includes("youtube") || lower.includes("youtu.be")) return "YouTube";
  return "Unknown";
}

function firstLocation(vendor) {
  if (vendor.city) return vendor.city;
  if (vendor.address) return vendor.address.split(",")[0];
  return vendor.state || "Unknown";
}

async function countQuery(builder) {
  const { count, error } = await builder;
  if (error) throw error;
  return count || 0;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function dateKey(date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function makeTrend(days = 30) {
  const trend = [];
  const today = startOfDay(new Date());
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    trend.push({
      date: dateKey(date),
      label: date.toLocaleDateString("en-MY", { day: "numeric", month: "short" }),
      value: 0,
      active: 0,
      draft: 0,
    });
  }
  return trend;
}

function splitValues(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function buildDashboardAnalytics(vendors, reviews) {
  const trend = makeTrend(90);
  const trendByDate = new Map(trend.map((item) => [item.date, item]));
  const statusCounts = new Map([["active", 0], ["draft", 0], ["suspended", 0]]);
  const categoryCounts = new Map();
  const sourceCounts = new Map();

  for (const vendor of vendors) {
    const status = String(vendor.status || "draft").toLowerCase();
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    const createdDate = vendor.created_at && trendByDate.get(dateKey(vendor.created_at));
    if (createdDate) {
      createdDate.value += 1;
      if (status === "active") createdDate.active += 1;
      if (status === "draft") createdDate.draft += 1;
    }

    const categories = splitValues(vendor.cuisine_types);
    if (categories.length === 0) {
      categoryCounts.set("Uncategorized", (categoryCounts.get("Uncategorized") || 0) + 1);
    } else {
      categories.slice(0, 2).forEach((category) => {
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      });
    }

    if (vendor.source_video_url) {
      const source = platformBadge(vendor.source_video_url, vendor.source_platform);
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }
  }

  const hiddenReviews = reviews.filter((review) => review.is_hidden).length;
  const draftVendors = statusCounts.get("draft") || 0;
  const missingAddress = vendors.filter((vendor) => !vendor.address || !vendor.city).length;
  const missingHours = vendors.filter((vendor) => !vendor.operating_hours_raw).length;
  const aiImported = vendors.filter((vendor) => vendor.source_video_url).length;
  const aiDrafts = vendors.filter((vendor) => vendor.source_video_url && String(vendor.status || "").toLowerCase() === "draft").length;

  const toBreakdown = (map, limit = 6) => [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));

  const attentionItems = [
    { id: "drafts", label: "Draft vendors waiting for approval", value: draftVendors, href: "/admin/vendors2", tone: "warning" },
    { id: "missing-address", label: "Vendors missing verified location", value: missingAddress, href: "/admin/vendors2", tone: "warning" },
    { id: "missing-hours", label: "Vendors missing operating hours", value: missingHours, href: "/admin/vendors2", tone: "neutral" },
    { id: "hidden-reviews", label: "Hidden reviews to revisit", value: hiddenReviews, href: "/admin/reviews", tone: "danger" },
  ].filter((item) => item.value > 0);

  return {
    kpis: [
      { key: "totalVendors", label: "Total vendors", value: vendors.length, note: `${statusCounts.get("active") || 0} active`, href: "/admin/vendors2", tone: "neutral" },
      { key: "activeRate", label: "Active rate", value: vendors.length ? Math.round(((statusCounts.get("active") || 0) / vendors.length) * 100) : 0, suffix: "%", note: "of all vendor records", href: "/admin/vendors2?status=active", tone: "success" },
      { key: "pendingDrafts", label: "Pending drafts", value: draftVendors, note: "awaiting approval", href: "/admin/vendors2?status=draft", tone: "warning" },
      { key: "aiImported", label: "AI imported", value: aiImported, note: `${aiDrafts} still in draft`, href: "/admin/ai", tone: "accent" },
      { key: "reviews", label: "Reviews", value: reviews.length, note: `${hiddenReviews} hidden`, href: "/admin/reviews", tone: "neutral" },
    ],
    vendorTrend: trend,
    statusBreakdown: [
      { label: "Active", value: statusCounts.get("active") || 0, tone: "success" },
      { label: "Draft", value: statusCounts.get("draft") || 0, tone: "warning" },
      { label: "Suspended", value: statusCounts.get("suspended") || 0, tone: "danger" },
    ],
    categoryBreakdown: toBreakdown(categoryCounts),
    sourceBreakdown: toBreakdown(sourceCounts, 4),
    aiPipeline: [
      { label: "AI imported", value: aiImported, tone: "accent" },
      { label: "Needs review", value: aiDrafts, tone: "warning" },
      { label: "Active", value: vendors.filter((vendor) => vendor.source_video_url && String(vendor.status || "").toLowerCase() === "active").length, tone: "success" },
      { label: "Needs data", value: vendors.filter((vendor) => vendor.source_video_url && (!vendor.address || !vendor.operating_hours_raw)).length, tone: "danger" },
    ],
    attentionItems,
  };
}

router.get("/dashboard", async (_req, res) => {
  try {
    const [totalVendors, activeVendors, pendingReview, aiVideosProcessed, pendingAppeals, recentVendorsRes, recentLogRes, analyticsVendorsRes, analyticsReviewsRes] =
      await Promise.all([
        countQuery(supabase.from("vendors").select("id", { count: "exact", head: true })),
        countQuery(supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "active")),
        countQuery(supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "draft")),
        countQuery(supabase.from("vendors").select("id", { count: "exact", head: true }).not("source_video_url", "is", null)),
        countQuery(supabase.from("suspension_appeals").select("id", { count: "exact", head: true }).eq("status", "pending")),
        supabase
          .from("vendors")
          .select("id,vendor_name,cuisine_types,address,city,state,status,created_at,last_updated")
          .order("last_updated", { ascending: false, nullsFirst: false })
          .limit(5),
        supabase
          .from("vendors")
          .select("id,vendor_name,source_video_url,source_platform,signature_dishes,ai_review_summary,sentiment_score,address,city,state,last_updated")
          .not("source_video_url", "is", null)
          .order("last_updated", { ascending: false, nullsFirst: false })
          .limit(5),
        supabase
          .from("vendors")
          .select("id,vendor_name,cuisine_types,address,city,state,status,source_video_url,source_platform,operating_hours_raw,created_at,last_updated")
          .limit(5000),
        supabase
          .from("reviews")
          .select("id,is_hidden,created_at")
          .limit(5000),
      ]);

    if (recentVendorsRes.error) throw recentVendorsRes.error;
    if (recentLogRes.error) throw recentLogRes.error;

    const analytics = buildDashboardAnalytics(
      requireDashboardData(analyticsVendorsRes, "vendors"),
      requireDashboardData(analyticsReviewsRes, "reviews"),
    );
    if (pendingAppeals > 0) {
      analytics.attentionItems.unshift({
        id: "pending-appeals",
        label: "Suspension appeals waiting for review",
        value: pendingAppeals,
        href: "/admin/users",
        tone: "danger",
      });
    }

    const stats = [
      { label: "Total Vendors", value: totalVendors, note: "Records in Supabase", tone: "neutral" },
      { label: "Active Vendors", value: activeVendors, note: `${totalVendors ? Math.round((activeVendors / totalVendors) * 100) : 0}% activation`, tone: "success" },
      { label: "Pending Review", value: pendingReview, note: "Drafts awaiting approval", tone: "warning" },
      { label: "AI Videos Processed", value: aiVideosProcessed, note: "Saved from AI pipeline", tone: "accent" },
    ];

    const recentVendors = (recentVendorsRes.data || []).map((vendor) => ({
      id: vendor.id,
      name: vendor.vendor_name,
      initials: (vendor.vendor_name || "?").trim().charAt(0).toUpperCase(),
      category: vendor.cuisine_types?.split(",")[0]?.trim() || "Uncategorized",
      location: firstLocation(vendor),
      status: (vendor.status || "draft").toUpperCase(),
    }));

    const recentProcessing = (recentLogRes.data || []).map((item) => ({
      id: item.id,
      title: item.ai_review_summary?.split(".")[0]?.trim() || item.vendor_name,
      vendor: item.vendor_name,
      platform: platformBadge(item.source_video_url, item.source_platform),
      recommendation: recommendationLabel(item.sentiment_score),
    }));

    res.json({
      stats,
      recentVendors,
      recentProcessing,
      ...analytics,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load admin dashboard", details: error.message });
  }
});

const ADMIN_CATEGORIES = ["Malaysian / Local", "Nyonya / Peranakan", "Chinese", "Cafe / Dessert", "Western"];

router.get("/vendors", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
  const status = String(req.query.status || "all").toLowerCase();
  const category = String(req.query.category || "all");
  const sort = String(req.query.sort || "default").toLowerCase();
  const query = String(req.query.q || "").trim();

  try {
    let builder = supabase
      .from("vendors")
      .select(
        "id,vendor_name,address,state,latitude,longitude,status,cuisine_types,signature_dishes,source_platform,source_video_url,sentiment_score,created_at,last_updated,phone,price_range,operating_hours,operating_hours_raw,location_precision,storefront_image_url,gallery_image_urls,cover_photo_locked",
        { count: "exact" }
      )
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (sort === "az") {
      builder = builder.order("vendor_name", { ascending: true });
    } else if (sort === "za") {
      builder = builder.order("vendor_name", { ascending: false });
    } else if (sort === "oldest") {
      builder = builder.order("created_at", { ascending: true, nullsFirst: false });
    } else if (sort === "status") {
      builder = builder.order("status", { ascending: true, nullsFirst: false });
    } else if (sort === "status_desc") {
      builder = builder.order("status", { ascending: false, nullsFirst: false });
    } else if (sort === "cat_az") {
      builder = builder.order("cuisine_types", { ascending: true, nullsFirst: false });
    } else if (sort === "cat_za") {
      builder = builder.order("cuisine_types", { ascending: false, nullsFirst: false });
    } else {
      // "default" and "newest" are the same — newest-created first.
      builder = builder.order("created_at", { ascending: false, nullsFirst: false });
    }
    // Secondary sort by id — many rows share an identical created_at from
    // bulk AI-pipeline inserts (or the same name), and Postgres doesn't
    // guarantee stable order among ties without a deterministic tiebreaker
    // (rows would shuffle between page loads otherwise).
    builder = builder.order("id", { ascending: true });

    const statuses = normalizeStatusFilter(status);
    if (statuses?.length === 1) builder = builder.eq("status", statuses[0]);
    if (statuses?.length > 1) builder = builder.in("status", statuses);
    if (category !== "all" && ADMIN_CATEGORIES.includes(category)) builder = builder.eq("cuisine_types", category);
    if (query) builder = builder.or(buildVendorSearch(query));

    const { data, error, count } = await builder;
    if (error) throw error;

    const items = (data || []).map((vendor) => ({
      id: vendor.id,
      name: vendor.vendor_name,
      category: vendor.cuisine_types?.split(",")[0]?.trim() || "Uncategorized",
      location: firstLocation(vendor),
      state: vendor.state,
      latitude: vendor.latitude,
      longitude: vendor.longitude,
      fullAddress: vendor.address,
      status: (vendor.status || "draft").toUpperCase(),
      videos: vendor.source_video_url ? 1 : 0,
      sourceVideoUrl: vendor.source_video_url || null,
      aiScore: vendor.sentiment_score,
      joined: vendor.created_at?.slice(0, 10) || null,
      sourcePlatform: platformBadge(vendor.source_video_url, vendor.source_platform),
      dishes: vendor.signature_dishes?.split(",").map((value) => value.trim()).filter(Boolean) || [],
      priceRange: vendor.price_range,
      phone: vendor.phone,
      operatingHours: vendor.operating_hours_raw || vendor.operating_hours,
      locationPrecision: vendor.location_precision,
      imageUrl: vendor.storefront_image_url || null,
      galleryUrls: Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [],
      coverLocked: vendor.cover_photo_locked === true,
    }));

    res.json({
      items,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load vendors", details: error.message });
  }
});

// Read-only fuzzy scan for the "possible duplicates" review panel — never
// deletes or merges anything; the admin reviews each pair and decides.
router.get("/vendors/duplicates", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vendors")
      .select("id, vendor_name, address, status, latitude, longitude, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const groups = findAllDuplicateGroups(data || []);
    res.json({ groups });
  } catch (error) {
    console.error("GET /vendors/duplicates failed:", error);
    res.status(500).json({ error: "Failed to scan for duplicate vendors" });
  }
});

router.patch("/vendors/:id", async (req, res) => {
  const { id } = req.params;

  const { errors, clean } = validateVendorPatch(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "Validation failed", fields: errors });
  }

  // Activating a vendor makes it publicly visible — an incomplete one (no
  // coordinates, no phone, no hours, ...) could read "Active" in this list
  // forever while never actually being a usable listing (or, for missing
  // coordinates specifically, never even reaching GET /restaurants/nearby,
  // which silently drops null-coordinate rows). Check the row that would
  // actually result from this patch — existing fields overridden by
  // whatever this request also changes — so a save that fixes the gap in
  // the same request is never falsely blocked.
  if (clean.status === "active") {
    const { data: current, error: findErr } = await supabase
      .from("vendors")
      .select("vendor_name, address, latitude, longitude, cuisine_types, operating_hours_raw, operating_hours, phone, price_range, signature_dishes, storefront_image_url")
      .eq("id", id)
      .maybeSingle();
    if (findErr) return res.status(500).json({ error: "Failed to update vendor", details: findErr.message });
    if (!current) return res.status(404).json({ error: "Vendor not found" });
    const issues = vendorActivationIssues({ ...current, ...clean });
    if (issues.length) {
      return res.status(400).json({
        error: `Cannot activate — missing or invalid: ${issues.join(", ")}. Complete these in Edit Vendor first.`,
      });
    }
  }

  const patch = { ...clean, last_updated: new Date().toISOString() };
  // Write both hour columns — operating_hours previously went stale because
  // only operating_hours_raw was updated here while the GET preferred
  // operating_hours.
  if (clean.operating_hours_raw != null) patch.operating_hours = clean.operating_hours_raw;

  try {
    const { data, error } = await supabase
      .from("vendors")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      // PGRST116 = "no rows" from .single() — the id doesn't exist.
      if (error.code === "PGRST116") return res.status(404).json({ error: "Vendor not found" });
      throw error;
    }
    if (clean.status === "active") {
      try {
        await supabase
          .from("vendor_suggestions")
          .update({ status: "published", published_at: new Date().toISOString() })
          .eq("vendor_id", id)
          .in("status", ["draft_created", "admin_review"]);
      } catch (syncError) {
        console.error("vendor suggestion publish sync failed:", syncError.message);
      }
    }
    await logActivity({ actor: req.callerUser, action: "vendor.update", entityType: "vendor", entityId: id });
    res.json(data);
  } catch (error) {
    console.error("PATCH /vendors/:id failed:", error);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

router.get("/ai-records", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 5));

  try {
    const { data, error, count } = await supabase
      .from("vendors")
      .select(
        "id,vendor_name,address,city,state,source_platform,source_video_url,signature_dishes,ai_review_summary,sentiment_score,last_updated,price_range,status",
        { count: "exact" }
      )
      .not("source_video_url", "is", null)
      .order("last_updated", { ascending: false, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    const items = (data || []).map((item) => ({
      id: item.id,
      title: item.ai_review_summary?.split(".")[0]?.trim() || item.vendor_name,
      vendor: item.vendor_name,
      platform: platformBadge(item.source_video_url, item.source_platform),
      location: item.city || firstLocation(item),
      dishes: item.signature_dishes?.split(",").map((value) => value.trim()).filter(Boolean) || [],
      recommendation: recommendationLabel(item.sentiment_score),
      score: item.sentiment_score,
      status: (item.status || "draft").toUpperCase(),
      sourceVideoUrl: item.source_video_url,
      summary: item.ai_review_summary,
      priceRange: item.price_range,
      lastUpdated: item.last_updated,
    }));

    res.json({
      items,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load AI processing records", details: error.message });
  }
});

router.post("/ai/submit", async (req, res) => {
  const url = String(req.body?.url || "").trim();

  if (!url) {
    return res.status(400).json({ error: "A TikTok or YouTube URL is required" });
  }

  try {
    const job = await startProcessingJob(url);
    await logActivity({ actor: req.callerUser, action: "ai.submit", entityType: "ai_job", metadata: { url } });
    return res.json(job);
  } catch (error) {
    return res.status(error.status || 502).json({
      error: error.message || "Failed to submit AI processing job",
    });
  }
});

// Used to proxy a health check to the separate Python AI service — now
// there's no separate service to ask, so this instead reports whether the
// AI toolchain this same process depends on (yt-dlp, Groq) is actually
// usable, which is a more useful thing for an admin to know anyway.
router.get("/ai/service-status", async (_req, res) => {
  try {
    const version = await ytDlp(["--version"], { timeoutMs: 10_000 });
    return res.json({
      available: version.code === 0 && Boolean(process.env.GROQ_API_KEY),
      ytDlp: version.code === 0 ? version.stdout.trim() : null,
      groq: Boolean(process.env.GROQ_API_KEY),
    });
  } catch (error) {
    return res.json({ available: false, error: error.message });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const platformSettings = [
      { label: "Platform Name", value: "TrueBites" },
      { label: "Tagline", value: "Official Food Discovery Platform · Melaka Tourism" },
      { label: "Contact Email", value: "admin@truebites.my" },
    ];

    const aiSettings = [
      { label: "Whisper Model", value: "whisper-large-v3 (Groq)" },
      { label: "LLM Model", value: "openai/gpt-oss-20b (Groq)" },
      { label: "Max Batch Size", value: "1000 videos" },
      { label: "Auto-save to Database", value: "Enabled (manual review before save)" },
      {
        label: "Backend API",
        value: resolvePublicBaseUrl({
          configuredBaseUrl: process.env.PUBLIC_BASE_URL,
          protocol: req.protocol,
          host: req.get("host"),
        }) || "Not configured",
      },
    ];

    const recentJobs = [];
    if (fs.existsSync(OUTPUTS_DIR)) {
      const jobIds = fs.readdirSync(OUTPUTS_DIR).slice(-5);
      for (const jobId of jobIds) {
        const statusPath = path.join(OUTPUTS_DIR, jobId, "status.json");
        if (!fs.existsSync(statusPath)) continue;
        try {
          const content = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
          recentJobs.push({
            id: content.job_id,
            status: content.status,
            platform: content.platform,
            createdAt: content.created_at,
          });
        } catch {
          // Ignore malformed local status files.
        }
      }
    }

    res.json({ platformSettings, aiSettings, recentJobs });
  } catch (error) {
    res.status(500).json({ error: "Failed to load settings", details: error.message });
  }
});

router.post("/vendors", async (req, res) => {
  const { errors, clean } = validateVendor(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "Validation failed", fields: errors });
  }

  try {
    // Fuzzy name+address match against existing vendors — warn, don't block.
    // `force: true` (the admin clicked "Add anyway") skips straight past this.
    if (req.body?.force !== true) {
      const { data: candidates, error: candErr } = await supabase
        .from("vendors")
        .select("id, vendor_name, address, status")
        .ilike("vendor_name", `%${clean.vendor_name.replace(/[%(),]/g, " ")}%`)
        .limit(200);
      if (candErr) throw candErr;

      const duplicates = findDuplicatesFor(
        { vendor_name: clean.vendor_name, address: clean.address },
        candidates || [],
      );
      if (duplicates.length) {
        return res.status(409).json({ error: "possible_duplicate", duplicates });
      }
    }

    const now = new Date().toISOString();
    const record = {
      ...clean,
      // Every new vendor starts as "draft" regardless of what the Add
      // Vendor form's Status field requested — a brand-new row can never
      // have a cover photo yet (uploading one needs a vendorId, which
      // doesn't exist until after this insert), so it can never pass the
      // same completeness bar (vendorActivationIssues) every other
      // "make it active" path already enforces. Rejecting the create
      // outright when Active was requested would be worse UX (the admin
      // may be about to add a photo in the very next step), so this stays
      // silent here — AddVendorModal's follow-up photo step promotes to
      // Active afterward via the normal PATCH /vendors/:id route, which
      // does check for a cover photo by then.
      status: "draft",
      // GET prefers operating_hours; keep it in sync with the raw value.
      operating_hours: clean.operating_hours_raw,
      created_at: now,
      last_updated: now,
    };

    const { data, error } = await supabase
      .from("vendors")
      .insert(record)
      .select("*")
      .single();

    if (error) {
      const status = error.code === "23505" ? 409 : 500; // unique violation → conflict
      if (status === 409) return res.status(409).json({ error: "A vendor with these details already exists" });
      throw error;
    }
    await logActivity({ actor: req.callerUser, action: "vendor.create", entityType: "vendor", entityId: data.id });
    res.status(201).json(data);
  } catch (error) {
    console.error("POST /vendors failed:", error);
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

const REVIEW_PHOTO_BUCKET = "review-photos";

// Extract the object path for an arbitrary public bucket URL (the shared
// storagePathFromUrl is hardcoded to the vendor-images bucket).
function pathFromUrl(bucket, url) {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
}

router.delete("/vendors/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 404 up front, and grab the storefront + gallery images so we can clean
    // them up after.
    const { data: vendor, error: findErr } = await supabase
      .from("vendors")
      .select("id, storefront_image_url, gallery_image_urls")
      .eq("id", id)
      .single();
    if (findErr?.code === "PGRST116" || !vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    if (findErr) throw findErr;

    // Clean up related records in FK-safe order (children first) so nothing is
    // orphaned regardless of whether the DB has ON DELETE CASCADE. The schema
    // isn't in-repo, so we do this explicitly in app code.
    const { data: reviews } = await supabase.from("reviews").select("id").eq("vendor_id", id);
    const reviewIds = (reviews || []).map((r) => r.id);

    if (reviewIds.length) {
      // Review photos: remove storage objects, then the rows.
      const { data: photos } = await supabase
        .from("review_photos").select("url").in("review_id", reviewIds);
      const photoPaths = (photos || []).map((p) => pathFromUrl(REVIEW_PHOTO_BUCKET, p.url)).filter(Boolean);
      if (photoPaths.length) await supabase.storage.from(REVIEW_PHOTO_BUCKET).remove(photoPaths);
      await supabase.from("review_photos").delete().in("review_id", reviewIds);
      await supabase.from("review_votes").delete().in("review_id", reviewIds);
    }

    await supabase.from("reviews").delete().eq("vendor_id", id);
    await supabase.from("bookmarks").delete().eq("vendor_id", id);

    const { error: delErr } = await supabase.from("vendors").delete().eq("id", id);
    if (delErr) throw delErr;

    // Best-effort removal of the storefront + gallery images (don't fail the
    // request if a storage object is already gone).
    const galleryUrls = Array.isArray(vendor.gallery_image_urls) ? vendor.gallery_image_urls : [];
    const imagePaths = [vendor.storefront_image_url, ...galleryUrls]
      .map(storagePathFromUrl)
      .filter(Boolean);
    if (imagePaths.length) await supabase.storage.from(STORAGE_BUCKET).remove(imagePaths);

    await logActivity({ actor: req.callerUser, action: "vendor.delete", entityType: "vendor", entityId: id });
    res.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /vendors/:id failed:", error);
    res.status(500).json({ error: "Failed to delete vendor" });
  }
});

router.get("/reviews", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
  const visibility = String(req.query.visibility || "all").toLowerCase();

  try {
    let builder = supabase
      .from("reviews")
      .select("id, rating, body, author_name, is_hidden, hidden_reason, created_at, vendor:vendors(id, vendor_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (visibility === "hidden") builder = builder.eq("is_hidden", true);
    if (visibility === "visible") builder = builder.eq("is_hidden", false);

    const { data, error, count } = await builder;
    if (error) throw error;

    const items = (data || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      authorName: r.author_name,
      isHidden: r.is_hidden,
      hiddenReason: r.hidden_reason,
      createdAt: r.created_at,
      vendorId: r.vendor?.id,
      vendorName: r.vendor?.vendor_name,
    }));

    res.json({
      items,
      pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load reviews", details: error.message });
  }
});

router.patch("/reviews/:id/visibility", async (req, res) => {
  const { id } = req.params;
  const isHidden = Boolean(req.body?.is_hidden);

  try {
    const { data, error } = await supabase
      .from("reviews")
      .update({ is_hidden: isHidden, hidden_reason: isHidden ? "admin" : null })
      .eq("id", id)
      .select("id, vendor_id")
      .single();
    if (error) throw error;

    await recomputeVendorRating(data.vendor_id);
    await logActivity({
      actor: req.callerUser,
      action: isHidden ? "review.hide" : "review.unhide",
      entityType: "review",
      entityId: data.id,
      metadata: { vendor_id: data.vendor_id },
    });
    res.json({ id: data.id, isHidden });
  } catch (error) {
    res.status(500).json({ error: "Failed to update review visibility", details: error.message });
  }
});

// Customer accounts exist only as Supabase Auth users (no app-side `users`
// table), and listUsers() paginates server-side — so to search/paginate on
// our own terms we page through every user once per request and filter/sort
// in memory. Fine at this app's scale; would need a real query if the user
// base got large.
async function fetchAllAuthUsers() {
  const perPage = 1000;
  let page = 1;
  let all = [];
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    all = all.concat(users);
    if (users.length < perPage) break;
    page += 1;
  }
  return all;
}

function customerDisplayName(user) {
  const meta = user.user_metadata || {};
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

// Read-only: the signed-in admin's own audit trail — every action they've
// personally taken (vendor edits, review moderation, user suspensions,
// appeal decisions, ...). Same audit_log table and shape as the per-customer
// activity log below, just scoped to req.callerUser instead of a :id param.
router.get("/me/activity", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));

  // The DISABLE_AUTH dev bypass's synthetic caller has id "dev" — not a real
  // uuid, and logActivity stores a null actor_id for it (see lib/auditLog.js),
  // so there's nothing to query and the eq() below would just error on the
  // malformed uuid.
  if (req.callerUser.id === "dev") {
    return res.json({ items: [], pagination: { page: 1, pageSize, total: 0, totalPages: 1 } });
  }

  try {
    const { data, error, count } = await supabase
      .from("audit_log")
      .select("id, action, entity_type, entity_id, metadata, created_at", { count: "exact" })
      .eq("actor_id", req.callerUser.id)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw error;

    const items = (data || []).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));

    res.json({
      items,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load your activity log", details: error.message });
  }
});

// Read-only: every non-admin (customer) account, for the User Moderation
// panel. Admin accounts are hardcoded via Supabase directly and don't show
// up here — this list is customers only.
router.get("/users", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
  const query = String(req.query.q || "").trim().toLowerCase();

  try {
    const allUsers = await fetchAllAuthUsers();
    // Excludes "superadmin" too, in case any pre-refactor accounts still
    // carry that role value in Supabase — see roles.js, which now only
    // recognizes "admin".
    const customers = allUsers.filter((user) => !["admin", "superadmin"].includes(user.app_metadata?.role));

    const filtered = query
      ? customers.filter((user) =>
          (user.email || "").toLowerCase().includes(query) ||
          (customerDisplayName(user) || "").toLowerCase().includes(query)
        )
      : customers;

    filtered.sort((a, b) => (a.email || "").localeCompare(b.email || ""));

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const pageOfUsers = filtered.slice(start, start + pageSize);

    // One query for the whole page's pending appeals rather than N —
    // powers the ticket icon next to a suspended user's name.
    const pageUserIds = pageOfUsers.map((user) => user.id);
    const { data: appealRows } = pageUserIds.length
      ? await supabase
          .from("suspension_appeals")
          .select("id, user_id")
          .eq("status", "pending")
          .in("user_id", pageUserIds)
      : { data: [] };
    const pendingAppealByUser = new Map((appealRows || []).map((row) => [row.user_id, row.id]));

    const items = pageOfUsers.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: customerDisplayName(user),
      avatarUrl: user.user_metadata?.avatar_url || null,
      provider: (user.app_metadata?.providers || [])[0] || "email",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      suspended: isSuspended(user.app_metadata),
      pendingAppealId: pendingAppealByUser.get(user.id) || null,
    }));

    res.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load users", details: error.message });
  }
});

// Read-only: full activity log for one customer account — what they did and
// when. Reuses the same audit_log table admin actions are written to
// (see lib/auditLog.js); customer actions are logged there already
// (reviews, bookmarks, profile/account changes).
router.get("/users/:id/activity", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 50));

  try {
    const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(req.params.id);
    if (userErr || !userRes?.user) return res.status(404).json({ error: "User not found" });

    const { data, error, count } = await supabase
      .from("audit_log")
      .select("id, action, entity_type, entity_id, metadata, created_at", { count: "exact" })
      .eq("actor_id", req.params.id)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw error;

    const items = (data || []).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));

    res.json({
      user: {
        id: userRes.user.id,
        email: userRes.user.email,
        displayName: customerDisplayName(userRes.user),
      },
      items,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load activity log", details: error.message });
  }
});

// Deliberately NOT Supabase Auth's ban_duration/banned_until — that blocks
// sign-in outright at the GoTrue level. A suspended customer should still be
// able to log in and browse the discovery grid; they just can't save
// bookmarks, post reviews, or use the map (enforced in engagement.js and
// gated client-side in MapPage.jsx). So suspension state is tracked entirely
// in app_metadata instead, and expiry is computed here rather than relying
// on GoTrue's own duration handling.
const SUSPEND_DURATIONS_MS = {
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

router.patch("/users/:id/suspend", async (req, res) => {
  const duration = String(req.body?.duration || "");
  const isReactivate = duration === "none";
  const isIndefinite = duration === "indefinite";
  if (!isReactivate && !isIndefinite && !SUSPEND_DURATIONS_MS[duration]) {
    return res.status(400).json({ error: `duration must be one of: ${[...Object.keys(SUSPEND_DURATIONS_MS), "indefinite", "none"].join(", ")}` });
  }
  const reason = String(req.body?.reason || "").trim().slice(0, 2000);
  if (!isReactivate && !reason) {
    return res.status(400).json({ error: "A reason is required to suspend an account" });
  }

  try {
    // updateUserById replaces app_metadata wholesale, so the existing role
    // (and anything else on it) has to be fetched and spread back in rather
    // than overwritten. Suspension fields are cleared on reactivation so a
    // future suspension never accidentally shows stale data.
    const { data: existing, error: findErr } = await supabase.auth.admin.getUserById(req.params.id);
    if (findErr || !existing?.user) return res.status(404).json({ error: "User not found" });

    const suspensionUntil = !isReactivate && !isIndefinite
      ? new Date(Date.now() + SUSPEND_DURATIONS_MS[duration]).toISOString()
      : null;

    const { data, error } = await supabase.auth.admin.updateUserById(req.params.id, {
      // Belt and braces: accounts suspended before this feature stopped
      // using Supabase's own ban_duration may still carry a real
      // banned_until from that older code path. Clearing it unconditionally
      // here guarantees suspension is only ever enforced by app_metadata
      // (see lib/suspension.js), never by GoTrue rejecting sign-in outright.
      ban_duration: "none",
      app_metadata: {
        ...existing.user.app_metadata,
        suspended: !isReactivate,
        suspension_reason: isReactivate ? null : reason,
        suspension_until: suspensionUntil,
        suspension_indefinite: !isReactivate && isIndefinite,
      },
    });
    if (error) throw error;

    await logActivity({
      actor: req.callerUser,
      action: isReactivate ? "user.reactivate" : "user.suspend",
      entityType: "user",
      entityId: req.params.id,
      metadata: isReactivate ? null : { duration, reason },
    });

    res.json({ id: data.user.id, suspended: isSuspended(data.user.app_metadata) });
  } catch (error) {
    res.status(500).json({ error: "Failed to update suspension", details: error.message });
  }
});

// Powers the numbered badge next to the "User Moderation" nav item — a
// cheap count-only query, separate from the full /appeals list below.
router.get("/appeals/pending-count", async (_req, res) => {
  try {
    const { count, error } = await supabase
      .from("suspension_appeals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to load appeal count", details: error.message });
  }
});

// Full detail for one appeal — backs the review modal opened from the
// ticket icon next to a suspended user's name.
router.get("/appeals/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("suspension_appeals")
      .select("id, user_id, user_email, message, status, reviewed_at, created_at")
      .eq("id", req.params.id)
      .single();
    if (error?.code === "PGRST116" || !data) return res.status(404).json({ error: "Appeal not found" });
    if (error) throw error;

    res.json({
      id: data.id,
      userId: data.user_id,
      userEmail: data.user_email,
      message: data.message,
      status: data.status,
      reviewedAt: data.reviewed_at,
      createdAt: data.created_at,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load appeal", details: error.message });
  }
});

// Approving reactivates the account (same effect as PATCH /users/:id/suspend
// with duration "none"); rejecting just closes the ticket and leaves the
// suspension in place. Either way the appeal moves out of "pending" so it
// stops counting toward the badge and disappears from the ticket icon.
router.patch("/appeals/:id", async (req, res) => {
  const decision = String(req.body?.decision || "");
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
  }

  try {
    const { data: appeal, error: findErr } = await supabase
      .from("suspension_appeals")
      .select("id, user_id, status")
      .eq("id", req.params.id)
      .single();
    if (findErr?.code === "PGRST116" || !appeal) return res.status(404).json({ error: "Appeal not found" });
    if (findErr) throw findErr;
    if (appeal.status !== "pending") {
      return res.status(409).json({ error: "This appeal has already been reviewed" });
    }

    if (decision === "approve") {
      const { data: existing, error: userErr } = await supabase.auth.admin.getUserById(appeal.user_id);
      if (userErr || !existing?.user) return res.status(404).json({ error: "User not found" });

      const { error: reactivateErr } = await supabase.auth.admin.updateUserById(appeal.user_id, {
        ban_duration: "none",
        app_metadata: {
          ...existing.user.app_metadata,
          suspended: false,
          suspension_reason: null,
          suspension_until: null,
          suspension_indefinite: false,
        },
      });
      if (reactivateErr) throw reactivateErr;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("suspension_appeals")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        reviewed_by: req.callerUser?.id !== "dev" ? req.callerUser?.id : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select("id, status")
      .single();
    if (updateErr) throw updateErr;

    await logActivity({
      actor: req.callerUser,
      action: decision === "approve" ? "appeal.approve" : "appeal.reject",
      entityType: "suspension_appeal",
      entityId: req.params.id,
      metadata: { userId: appeal.user_id },
    });

    res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    res.status(500).json({ error: "Failed to update appeal", details: error.message });
  }
});

export default router;
