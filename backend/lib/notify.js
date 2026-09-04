import { supabase } from "../supabase.js";

// Records one row in the notifications feed. Never throws — a logging
// failure here must not break the vendor-publish request it's describing
// (same convention as logActivity in auditLog.js).
export async function notifyNewVendor({ id, vendor_name, cuisine_types } = {}) {
  try {
    await supabase.from("notifications").insert({
      type: "new_vendor",
      vendor_id: id || null,
      payload: { name: vendor_name || "", cuisine_types: cuisine_types || null },
    });
  } catch (err) {
    console.error("notify new_vendor failed:", err.message);
  }
}
