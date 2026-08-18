// Suspension state lives on app_metadata rather than Supabase Auth's own
// ban_duration/banned_until. That mechanism blocks sign-in entirely (GoTrue
// rejects the login request before any app code runs) — but a suspended
// customer should still be able to log in and browse, just not save
// bookmarks, post reviews, or use the map. Shared by admin.js (suspend /
// reactivate / user list) and engagement.js (blocking a suspended
// customer's write actions).
export function isSuspended(appMetadata) {
  if (!appMetadata?.suspended) return false;
  if (appMetadata.suspension_indefinite) return true;
  if (!appMetadata.suspension_until) return false;
  return new Date(appMetadata.suspension_until) > new Date();
}
