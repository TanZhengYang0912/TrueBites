import { supabase } from "../supabase.js";
import {
  NEW_VENDOR_NOTIFICATION,
  VENDOR_REACTIVATED_NOTIFICATION,
} from "./vendorLifecycle.js";

const VENDOR_LIFECYCLE_TYPES = new Set([
  NEW_VENDOR_NOTIFICATION,
  VENDOR_REACTIVATED_NOTIFICATION,
]);

// Records one row in the customer notification feed. Never throws: a feed
// failure must not roll back the successful vendor status change it describes.
export async function notifyVendorLifecycle({ type, id, vendor_name, cuisine_types } = {}) {
  if (!VENDOR_LIFECYCLE_TYPES.has(type)) return;

  try {
    const { error } = await supabase.from("notifications").insert({
      type,
      vendor_id: id || null,
      payload: { name: vendor_name || "", cuisine_types: cuisine_types || null },
    });

    if (error) throw error;
  } catch (err) {
    console.error(`notify ${type} failed:`, err.message);
  }
}
