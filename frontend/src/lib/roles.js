// One place decides what "admin" means. app_metadata is service-key only, so a
// user cannot grant themselves this by editing their own profile — user_metadata
// deliberately is not consulted.
export const isAdmin = (session) => session?.user?.app_metadata?.role === "admin";

// Customer surfaces call this instead of reading the session directly. An admin
// browsing the public site is a guest there, so every signed-out path the app
// already has — sign-in prompts, hidden save buttons, empty bookmark lists —
// applies unchanged, with no per-page special cases.
export const customerSession = (session) => (isAdmin(session) ? null : session);
