import { Router } from "express";
import { supabase } from "../supabase.js";
import { logActivity } from "../lib/auditLog.js";
import { assertTransition, statusesForSuggestionFilter, SUGGESTION_STATUSES } from "../lib/suggestionValidation.js";
import { startProcessingJob, retryJob, createDraftFromJob } from "../lib/ai/pipeline.js";
import { loadJob } from "../lib/ai/jobStore.js";
import { vendorActivationIssues } from "../lib/vendorValidation.js";
import { notifyNewVendor } from "../lib/notify.js";

const router = Router();

const ADMIN_SELECT = `
  id, user_id, suggestion_type, source_kind, vendor_name, influencer_name, source_url, source_platform, location_text, category,
  reason, signature_dish, price_range, additional_note, creator_name, creator_profile_url,
  creator_sample_video_url, creator_focus, creator_audience, creator_social_url, status, admin_note,
  rejection_reason, ai_job_id, vendor_id, reviewed_by, reviewed_at,
  published_at, created_at, updated_at,
  vendor:vendors(id, vendor_name, status, address, latitude, longitude, source_video_url)
`;

function cleanPage(value, fallback, max) {
  return Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));
}

// loadJob() returns null for an unknown job — the AI pipeline calls below
// used to be an HTTP request that could 404; this keeps the same
// "throw an error with .status" contract so the existing catch blocks below
// (checking error.status) don't need to change.
async function loadJobOrThrow(jobId) {
  const job = await loadJob(jobId);
  if (!job) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }
  return job;
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

router.get("/suggestions", async (req, res) => {
  const page = cleanPage(req.query.page, 1, 100000);
  const pageSize = cleanPage(req.query.pageSize, 10, 50);
  const status = String(req.query.status || "all");
  const q = String(req.query.q || "").trim();

  let query = supabase
    .from("vendor_suggestions")
    .select(ADMIN_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const statuses = statusesForSuggestionFilter(status);
  if (statuses) query = query.in("status", statuses);
  if (q) {
    const safeQuery = q.replaceAll("%", "").replaceAll("_", " ").replace(/[(),]/g, " ");
    query = query.or(`vendor_name.ilike.%${safeQuery}%,creator_name.ilike.%${safeQuery}%`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  res.json({
    suggestions: data || [],
    pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) },
  });
});

router.get("/suggestions/:id", async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    res.json({ suggestion: await withSubmitter(suggestion) });
  } catch (error) {
    res.status(500).json({ error: "database query failed", details: error.message });
  }
});

router.patch("/suggestions/:id/status", async (req, res) => {
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

router.post("/suggestions/:id/process", async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (suggestion.suggestion_type === "creator") return res.status(409).json({ error: "Creator suggestions use the creator review path, not vendor AI processing." });
    if (!["under_review", "accepted_for_processing", "failed"].includes(suggestion.status)) {
      return res.status(409).json({ error: `Suggestion is ${suggestion.status}; accept it before processing.` });
    }

    let job;
    if (suggestion.status === "failed" && suggestion.ai_job_id) {
      job = await retryJob(suggestion.ai_job_id);
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
      job = await startProcessingJob(suggestion.source_url);
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

router.get("/suggestions/:id/processing", async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (!suggestion.ai_job_id) return res.status(409).json({ error: "This suggestion has not been sent to AI processing." });

    const job = await loadJobOrThrow(suggestion.ai_job_id);
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

router.post("/suggestions/:id/create-draft", async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (suggestion.suggestion_type === "creator") return res.status(409).json({ error: "Creator suggestions do not create vendor drafts." });
    if (!suggestion.ai_job_id) return res.status(409).json({ error: "Process this suggestion before creating a draft." });

    const result = await createDraftFromJob(suggestion.ai_job_id, {
      summary: req.body?.summary || "",
      extracted: req.body?.extracted || {},
      duplicate_acknowledged: Boolean(req.body?.duplicate_acknowledged),
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

router.post("/suggestions/:id/publish", async (req, res) => {
  try {
    const suggestion = await getSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });

    if (suggestion.suggestion_type === "creator") {
      if (!["submitted", "under_review"].includes(suggestion.status)) {
        return res.status(409).json({ error: `Creator suggestion is ${suggestion.status}; review it before publishing.` });
      }

      const reviewedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("vendor_suggestions")
        .update({ status: "published", published_at: reviewedAt, reviewed_by: req.callerUser.id === "dev" ? null : req.callerUser.id, reviewed_at: reviewedAt })
        .eq("id", suggestion.id)
        .select(ADMIN_SELECT)
        .single();
      if (error) throw error;
      await logActivity({ actor: req.callerUser, action: "creator_suggestion.publish", entityType: "vendor_suggestion", entityId: suggestion.id, metadata: { source_platform: suggestion.source_platform } });
      return res.json({ suggestion: data });
    }

    if (suggestion.status !== "draft_created" || !suggestion.vendor_id) return res.status(409).json({ error: "Create a draft vendor before publishing." });

    // The AI extraction fills in what it could from the video; fields it
    // couldn't (phone, price range, precise hours, ...) are commonly still
    // blank at this point. Publishing sets the vendor live on the public
    // site, so the same completeness bar as every other "make it active"
    // action applies here — an admin should complete these in Edit Vendor
    // before Publish, not discover the listing is half-empty after the fact.
    const { data: vendorRow, error: findErr } = await supabase
      .from("vendors")
      .select("id, vendor_name, address, latitude, longitude, cuisine_types, operating_hours_raw, operating_hours, phone, price_range, signature_dishes")
      .eq("id", suggestion.vendor_id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!vendorRow) return res.status(404).json({ error: "Draft vendor not found" });
    const issues = vendorActivationIssues(vendorRow);
    if (issues.length) {
      return res.status(400).json({
        error: `Cannot publish — missing or invalid: ${issues.join(", ")}. Complete these in Edit Vendor first.`,
      });
    }

    const { data: vendor, error: vendorError } = await supabase.from("vendors").update({ status: "active" }).eq("id", suggestion.vendor_id).select("id,status").single();
    if (vendorError) throw vendorError;
    await notifyNewVendor({ id: vendor.id, vendor_name: vendorRow.vendor_name, cuisine_types: vendorRow.cuisine_types });
    const { data, error } = await supabase.from("vendor_suggestions").update({ status: "published", published_at: new Date().toISOString(), reviewed_by: req.callerUser.id === "dev" ? null : req.callerUser.id }).eq("id", suggestion.id).select(ADMIN_SELECT).single();
    if (error) throw error;
    await logActivity({ actor: req.callerUser, action: "vendor_suggestion.publish", entityType: "vendor_suggestion", entityId: suggestion.id, metadata: { vendor_id: vendor.id } });
    res.json({ suggestion: data, vendor });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to publish suggestion" });
  }
});

router.patch("/suggestions/batch", async (req, res) => {
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
