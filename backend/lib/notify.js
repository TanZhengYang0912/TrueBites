import { supabase } from "../supabase.js";

// Records one row in the notifications feed. Never throws — a logging
// failure here must not break the vendor-publish request it's describing
// (same convention as logActivity in auditLog.js).
export async function notifyNewVendor({ id, vendor_name, cuisine_types } = {}) {
  try {
    // A vendor is news once. Admins routinely suspend and re-activate a
    // listing while editing it, and every one of those is a genuine
    // not-active → active transition, so routes/admin.js correctly called
    // this five times for one café on 2026-09-05. "New place" has to mean
    // new to the reader, not newly re-activated, so the rule lives here
    // rather than in each route that publishes.
    //
    // ponytail: an existence check, not a UNIQUE (type, vendor_id) index —
    // Postgres will not build that index while the five duplicate rows from
    // that day are still in the table, and the owner chose to keep them. Two
    // simultaneous publishes of the same vendor could still race past this;
    // publishing is a human-speed admin action, so that is accepted. Clear
    // the old duplicates first if this ever needs a real constraint.
    if (id) {
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", "new_vendor")
        .eq("vendor_id", id)
        .limit(1)
        .maybeSingle();
      if (existing) return;
    }

    await supabase.from("notifications").insert({
      type: "new_vendor",
      vendor_id: id || null,
      payload: { name: vendor_name || "", cuisine_types: cuisine_types || null },
    });
  } catch (err) {
    console.error("notify new_vendor failed:", err.message);
  }
}
