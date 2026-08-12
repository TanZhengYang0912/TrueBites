// Per-tab access a superadmin can grant/revoke for individual admin accounts.
// Stored as app_metadata.permissions — service-key only, same trust model as
// role (see middleware/requireRole.js). Mirrors frontend/src/lib/roles.js.
export const PERMISSION_KEYS = ["vendors", "ai", "reviews", "settings"];

export const ACCESS_DENIED_MESSAGE =
  "Your moderator has disabled access for this function. Please contact your moderator to gain access.";

// Superadmin always has every permission. A missing/non-array permissions
// field means "not yet customized" — treated as full access so every
// account that existed before this feature keeps working unchanged.
export function hasPermission(user, key) {
  if (user?.app_metadata?.role === "superadmin") return true;
  const perms = user?.app_metadata?.permissions;
  if (!Array.isArray(perms)) return true;
  return perms.includes(key);
}

// Explicit resolved list for display (e.g. the Manage Account checkboxes) —
// an account with no customization shows every box ticked, matching
// hasPermission's "no permissions field = full access" default.
export function resolvePermissions(user) {
  const perms = user?.app_metadata?.permissions;
  return Array.isArray(perms) ? perms.filter((p) => PERMISSION_KEYS.includes(p)) : [...PERMISSION_KEYS];
}

// Supabase Auth's own ban mechanism (banned_until) doubles as our
// suspend/reactivate flag — no separate status column needed, and a
// suspended account is genuinely blocked from signing in, not just hidden.
export function deriveStatus(user) {
  if (!user?.banned_until) return "active";
  return new Date(user.banned_until) > new Date() ? "suspended" : "active";
}
