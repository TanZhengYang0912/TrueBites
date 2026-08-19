import { Router } from "express";
import { supabase } from "../supabase.js";
import { logActivity } from "../lib/auditLog.js";
import { requireUser } from "../middleware/requireUser.js";
import { validateSuggestionInput } from "../lib/suggestionValidation.js";

const router = Router();

const CUSTOMER_SELECT = `
  id, vendor_name, source_url, source_platform, location_text, category,
  reason, signature_dish, price_range, additional_note, status,
  rejection_reason, admin_note, vendor_id, created_at, updated_at, reviewed_at, published_at,
  vendor:vendors(id, vendor_name, status, address, latitude, longitude)
`;

router.post("/suggestions", requireUser, async (req, res) => {
  const { errors, clean } = validateSuggestionInput(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "validation failed", fields: errors });
  }

  const { data: existing, error: existingError } = await supabase
    .from("vendor_suggestions")
    .select("id,status")
    .eq("user_id", req.callerUser.id)
    .eq("vendor_name", clean.vendor_name)
    .eq("source_url", clean.source_url)
    .in("status", ["submitted", "under_review", "needs_info", "accepted_for_processing", "processing", "admin_review", "draft_created"])
    .limit(1);
  if (existingError) return res.status(500).json({ error: "database query failed", details: existingError.message });
  if (existing?.length) {
    return res.status(409).json({ error: "You already submitted this vendor and video.", suggestion_id: existing[0].id, status: existing[0].status });
  }

  const { data, error } = await supabase
    .from("vendor_suggestions")
    .insert({ ...clean, user_id: req.callerUser.id, status: "submitted" })
    .select(CUSTOMER_SELECT)
    .single();
  if (error) return res.status(500).json({ error: "database insert failed", details: error.message });

  await logActivity({
    actor: req.callerUser,
    action: "vendor_suggestion.create",
    entityType: "vendor_suggestion",
    entityId: data.id,
    metadata: { source_platform: clean.source_platform, vendor_name: clean.vendor_name },
  });

  res.status(201).json({ suggestion: data });
});

router.get("/suggestions/mine", requireUser, async (req, res) => {
  const { data, error } = await supabase
    .from("vendor_suggestions")
    .select(CUSTOMER_SELECT)
    .eq("user_id", req.callerUser.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  res.json({ suggestions: data || [] });
});

router.get("/suggestions/:id", requireUser, async (req, res) => {
  const { data, error } = await supabase
    .from("vendor_suggestions")
    .select(CUSTOMER_SELECT)
    .eq("id", req.params.id)
    .eq("user_id", req.callerUser.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });
  if (!data) return res.status(404).json({ error: "Suggestion not found" });

  res.json({ suggestion: data });
});

router.put("/suggestions/:id", requireUser, async (req, res) => {
  const { errors, clean } = validateSuggestionInput(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "validation failed", fields: errors });
  }

  // Find the suggestion
  const { data: current, error: findError } = await supabase
    .from("vendor_suggestions")
    .select("id, status")
    .eq("id", req.params.id)
    .eq("user_id", req.callerUser.id)
    .single();

  if (findError || !current) return res.status(404).json({ error: "Suggestion not found" });
  if (current.status !== "needs_info") {
    return res.status(409).json({ error: "Only suggestions needing more info can be edited." });
  }

  // Check for duplicates again just in case the URL changed
  const { data: existing, error: existingError } = await supabase
    .from("vendor_suggestions")
    .select("id,status")
    .eq("user_id", req.callerUser.id)
    .eq("vendor_name", clean.vendor_name)
    .eq("source_url", clean.source_url)
    .neq("id", req.params.id) // exclude current
    .in("status", ["submitted", "under_review", "needs_info", "accepted_for_processing", "processing", "admin_review", "draft_created"])
    .limit(1);

  if (existingError) return res.status(500).json({ error: "database query failed", details: existingError.message });
  if (existing?.length) {
    return res.status(409).json({ error: "You already submitted this vendor and video.", suggestion_id: existing[0].id, status: existing[0].status });
  }

  const { data, error } = await supabase
    .from("vendor_suggestions")
    .update({ ...clean, status: "under_review", admin_note: null })
    .eq("id", req.params.id)
    .eq("user_id", req.callerUser.id)
    .select(CUSTOMER_SELECT)
    .single();
    
  if (error) return res.status(500).json({ error: "database update failed", details: error.message });

  await logActivity({
    actor: req.callerUser,
    action: "vendor_suggestion.update",
    entityType: "vendor_suggestion",
    entityId: data.id,
    metadata: { source_platform: clean.source_platform, vendor_name: clean.vendor_name, previous_status: current.status, next_status: "under_review" },
  });

  res.json({ suggestion: data });
});

export default router;
