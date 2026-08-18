import { Router } from "express";
import { supabase } from "../supabase.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { logActivity } from "../lib/auditLog.js";
import { assertTransition, SUGGESTION_STATUSES } from "../lib/suggestionValidation.js";

const router = Router();
const suggestionPermission = requirePermission("suggestions");
const AI_SERVICE_BASE = String(process.env.AI_SERVICE_BASE || "http://localhost:8000").replace(/\/$/, "");
const AI_INTERNAL_KEY = process.env.AI_INTERNAL_KEY || "";

const ADMIN_SELECT = `
  id, user_id, vendor_name, source_url, source_platform, location_text, category,
  reason, signature_dish, price_range, additional_note, status, admin_note,
  rejection_reason, ai_job_id, vendor_id, reviewed_by, reviewed_at,
  published_at, created_at, updated_at,
  vendor:vendors(id, vendor_name, status, address, latitude, longitude, source_video_url)
`;

function cleanPage(value, fallback, max) {
  return Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));
}

function aiHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...(AI_INTERNAL_KEY ? { "X-Internal-Key": AI_INTERNAL_KEY } : {}),
    ...extra,
  };
}

async function aiRequest(path, options = {}) {
  const response = await fetch(`${AI_SERVICE_BASE}/api${path}`, {
    ...options,
    headers: aiHeaders(options.headers || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.detail || payload.error || "AI service request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function getSuggestion(id) {
  const { data, error } = await supabase
    .from("vendor_suggestions")
    .select(ADMIN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function withSubmitter(row) {
  if (!row?.user_id) return row;
  try {
    const { data } = await supabase.auth.admin.getUserById(row.user_id);
    return {
      ...row,
      submitter: data?.user ? {
        id: data.user.id,
        email: data.user.email || null,
        name: [data.user.user_metadata?.first_name, data.user.user_metadata?.last_name].filter(Boolean).join(" ") || null,
      } : null,
    };
  } catch {
    return row;
  }
}

router.get("/suggestions", suggestionPermission, async (req, res) => {
  const page = cleanPage(req.query.page, 1, 100000);
  const pageSize = cleanPage(req.query.pageSize, 10, 50);
  const status = String(req.query.status || "all");
  const q = String(req.query.q || "").trim();

  let query = supabase
    .from("vendor_suggestions")
    .select(ADMIN_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (status !== "all" && SUGGESTION_STATUSES.includes(status)) query = query.eq("status", status);
  if (q) query = query.ilike("vendor_name", `%${q.replaceAll("%", "").replaceAll("_", " ")}%`);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  res.json({
    suggestions: data || [],
    pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) },
  });
});

router.get("/suggestions/:id", suggestionPermission, async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    res.json({ suggestion: await withSubmitter(suggestion) });
  } catch (error) {
    res.status(500).json({ error: "database query failed", details: error.message });
  }
});

router.patch("/suggestions/:id/status", suggestionPermission, async (req, res) => {
  const nextStatus = String(req.body?.status || "");
  if (!SUGGESTION_STATUSES.includes(nextStatus)) return res.status(400).json({ error: "Invalid suggestion status" });

  try {
    const current = await getSuggestion(req.params.id);
    if (!current) return res.status(404).json({ error: "Suggestion not found" });
    if (current.status !== nextStatus) assertTransition(current.status, nextStatus);

    const patch = {
      status: nextStatus,
      admin_note: typeof req.body?.admin_note === "string" ? req.body.admin_note.trim() || null : current.admin_note,
      rejection_reason: typeof req.body?.rejection_reason === "string" ? req.body.rejection_reason.trim() || null : current.rejection_reason,
      reviewed_by: req.callerUser.id === "dev" ? null : req.callerUser.id,
      reviewed_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("vendor_suggestions").update(patch).eq("id", current.id).select(ADMIN_SELECT).single();
    if (error) throw error;

    await logActivity({ actor: req.callerUser, action: "vendor_suggestion.status_change", entityType: "vendor_suggestion", entityId: current.id, metadata: { from: current.status, to: nextStatus } });
    res.json({ suggestion: data });
  } catch (error) {
    const status = error.code === "INVALID_SUGGESTION_TRANSITION" ? 409 : 500;
    res.status(status).json({ error: error.message || "Unable to update suggestion" });
  }
});

router.post("/suggestions/:id/process", suggestionPermission, async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (!["under_review", "accepted_for_processing", "failed"].includes(suggestion.status)) {
      return res.status(409).json({ error: `Suggestion is ${suggestion.status}; accept it before processing.` });
    }

    let job;
    if (suggestion.status === "failed" && suggestion.ai_job_id) {
      job = await aiRequest(`/retry/${suggestion.ai_job_id}`, { method: "POST" });
    } else {
      if (suggestion.status === "under_review") {
        assertTransition("under_review", "accepted_for_processing");
        const { error: acceptError } = await supabase
          .from("vendor_suggestions")
          .update({
            status: "accepted_for_processing",
            reviewed_by: req.callerUser.id === "dev" ? null : req.callerUser.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", suggestion.id);
        if (acceptError) throw acceptError;
      }
      job = await aiRequest("/process", { method: "POST", body: JSON.stringify({ url: suggestion.source_url }) });
    }

    const patch = { ai_job_id: job.job_id, status: "processing", reviewed_by: req.callerUser.id === "dev" ? null : req.callerUser.id, reviewed_at: new Date().toISOString() };
    const { data, error } = await supabase.from("vendor_suggestions").update(patch).eq("id", suggestion.id).select(ADMIN_SELECT).single();
    if (error) throw error;
    await logActivity({ actor: req.callerUser, action: "vendor_suggestion.ai_process", entityType: "vendor_suggestion", entityId: suggestion.id, metadata: { job_id: job.job_id } });
    res.status(202).json({ suggestion: data, job });
  } catch (error) {
    if (error.code === "INVALID_SUGGESTION_TRANSITION") return res.status(409).json({ error: error.message });
    res.status(error.status || 502).json({ error: error.message || "AI processing request failed" });
  }
});

router.get("/suggestions/:id/processing", suggestionPermission, async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (!suggestion.ai_job_id) return res.status(409).json({ error: "This suggestion has not been sent to AI processing." });

    const job = await aiRequest(`/status/${suggestion.ai_job_id}`);
    let currentSuggestion = suggestion;
    if (job.status === "completed" && suggestion.status === "processing") {
      const { data } = await supabase.from("vendor_suggestions").update({ status: "admin_review" }).eq("id", suggestion.id).select(ADMIN_SELECT).single();
      currentSuggestion = data || suggestion;
    } else if (job.status === "error" && suggestion.status === "processing") {
      const { data } = await supabase.from("vendor_suggestions").update({ status: "failed" }).eq("id", suggestion.id).select(ADMIN_SELECT).single();
      currentSuggestion = data || suggestion;
    }
    res.json({ suggestion: currentSuggestion, job });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message || "Unable to load AI processing status" });
  }
});

router.post("/suggestions/:id/create-draft", suggestionPermission, async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (!suggestion.ai_job_id) return res.status(409).json({ error: "Process this suggestion before creating a draft." });

    const result = await aiRequest(`/create-draft/${suggestion.ai_job_id}`, {
      method: "POST",
      body: JSON.stringify({
        summary: req.body?.summary || "",
        extracted: req.body?.extracted || {},
        duplicate_acknowledged: Boolean(req.body?.duplicate_acknowledged),
      }),
    });
    if (result.status === "duplicate_review_required") return res.json(result);

    const vendorId = result.vendor_id || null;
    const patch = { status: "draft_created", vendor_id: vendorId, reviewed_by: req.callerUser.id === "dev" ? null : req.callerUser.id, reviewed_at: new Date().toISOString() };
    const { data, error } = await supabase.from("vendor_suggestions").update(patch).eq("id", suggestion.id).select(ADMIN_SELECT).single();
    if (error) throw error;
    await logActivity({ actor: req.callerUser, action: "vendor_suggestion.draft_created", entityType: "vendor_suggestion", entityId: suggestion.id, metadata: { vendor_id: vendorId } });
    res.json({ ...result, suggestion: data });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message || "Unable to create draft vendor" });
  }
});

router.post("/suggestions/:id/publish", suggestionPermission, async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (suggestion.status !== "draft_created" || !suggestion.vendor_id) return res.status(409).json({ error: "Create a draft vendor before publishing." });

    const { data: vendor, error: vendorError } = await supabase.from("vendors").update({ status: "active" }).eq("id", suggestion.vendor_id).select("id,status").single();
    if (vendorError) throw vendorError;
    const { data, error } = await supabase.from("vendor_suggestions").update({ status: "published", published_at: new Date().toISOString(), reviewed_by: req.callerUser.id === "dev" ? null : req.callerUser.id }).eq("id", suggestion.id).select(ADMIN_SELECT).single();
    if (error) throw error;
    await logActivity({ actor: req.callerUser, action: "vendor_suggestion.publish", entityType: "vendor_suggestion", entityId: suggestion.id, metadata: { vendor_id: vendor.id } });
    res.json({ suggestion: data, vendor });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to publish suggestion" });
  }
});

router.patch("/suggestions/batch", suggestionPermission, async (req, res) => {
  const { ids, status: nextStatus } = req.body;
  
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: "Missing or invalid ids array" });
  }
  if (!SUGGESTION_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ error: "Invalid suggestion status" });
  }

  const results = { updated: 0, failed: 0, errors: [] };

  // Loop through and update valid transitions
  for (const id of ids) {
    try {
      const current = await getSuggestion(id);
      if (!current) {
        results.failed++;
        results.errors.push(`Suggestion ${id} not found`);
        continue;
      }
      
      if (current.status !== nextStatus) {
        // Will throw if transition is invalid
        assertTransition(current.status, nextStatus);
        
        const patch = { status: nextStatus, updated_at: new Date().toISOString() };
        if (nextStatus === "rejected") {
          patch.rejection_reason = "Batch rejected by admin";
        }
        
        const { error } = await supabase
          .from("vendor_suggestions")
          .update(patch)
          .eq("id", id);
          
        if (error) throw error;
        
        await logActivity({
          actor: req.callerUser,
          action: "admin.suggestion.batch_update",
          entityType: "vendor_suggestion",
          entityId: id,
          metadata: { previous_status: current.status, next_status: nextStatus }
        });
        
        results.updated++;
      } else {
        // Status is already nextStatus, consider it a success
        results.updated++;
      }
    } catch (err) {
      results.failed++;
      results.errors.push(`Failed to update ${id}: ${err.message}`);
    }
  }

  res.json({ results });
});

export default router;
