// One place decides what "admin" means. app_metadata is service-key only, so a
// user cannot grant themselves this by editing their own profile — user_metadata
// deliberately is not consulted.
// Superadmin is a strict superset of admin — it gets everything admin gets,
// plus extra surfaces (e.g. Staff Moderation) gated separately by isSuperAdmin.
export const isSuperAdmin = (session) => session?.user?.app_metadata?.role === "superadmin";
export const isAdmin = (session) =>
  isSuperAdmin(session) || session?.user?.app_metadata?.role === "admin";

// Customer surfaces call this instead of reading the session directly. An admin
// browsing the public site is a guest there, so every signed-out path the app
// already has — sign-in prompts, hidden save buttons, empty bookmark lists —
// applies unchanged, with no per-page special cases.
export const customerSession = (session) => (isAdmin(session) ? null : session);

// Per-tab access a superadmin can grant/revoke for individual admin accounts
// (see the Manage Account panel in Staff Moderation). Stored as
// app_metadata.permissions — service-key only, same trust model as role.
export const PERMISSION_KEYS = ["vendors", "ai", "reviews", "settings"];
export const PERMISSION_LABELS = {
  vendors: "Manage Vendors",
  ai: "Manage AI Content Queue",
  reviews: "Manage Review Moderation",
  settings: "Manage Platform Settings",
};

// Superadmin always has every permission. A missing/non-array permissions
// field means "not yet customized" — treated as full access so every
// account that existed before this feature keeps working unchanged.
export const hasPermission = (session, key) => {
  if (!session?.user) return false;
  if (isSuperAdmin(session)) return true;
  const perms = session.user.app_metadata?.permissions;
  if (!Array.isArray(perms)) return true;
  return perms.includes(key);
};
