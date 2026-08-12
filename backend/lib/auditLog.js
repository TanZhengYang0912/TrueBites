import { supabase } from "../supabase.js";

// Records one row in audit_log. Never throws — a logging failure must never
// break the actual request it's describing, so failures are swallowed and
// just printed to stderr for local debugging.
//
// `actor` is whatever the caller already has on hand: req.callerUser (admin
// routes, a full Supabase Auth User) or a user object resolved from a bearer
// token (customer routes). The DISABLE_AUTH dev bypass sets callerUser to a
// minimal { id: "dev", app_metadata } stand-in with no email — handled here
// so every call site doesn't have to guard against it.
export async function logActivity({ actor, action, entityType = null, entityId = null, metadata = null }) {
  try {
    const actorId = actor?.id && actor.id !== "dev" ? actor.id : null;
    await supabase.from("audit_log").insert({
      actor_id: actorId,
      actor_email: actor?.email || null,
      actor_role: actor?.app_metadata?.role || "customer",
      action,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      metadata,
    });
  } catch (err) {
    console.error(`audit log failed (${action}):`, err.message);
  }
}
