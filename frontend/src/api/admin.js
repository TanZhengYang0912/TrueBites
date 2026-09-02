import { supabase } from "../supabaseClient";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function parseResponse(response) {
  if (response.ok) return response.json();

  let message = "Request failed";
  let payload = null;
  try {
    payload = await response.json();
    message = payload.details || payload.error || message;
  } catch {
    message = await response.text();
  }
  const error = new Error(message || "Request failed");
  error.status = response.status;
  // e.g. { error: "possible_duplicate", duplicates: [...] } from POST /admin/vendors —
  // callers that need the structured body (not just the message) read error.payload.
  error.payload = payload;
  throw error;
}

// Every admin call attaches the signed-in admin's access token so the
// requireRole("admin") gate on /api/admin can verify the caller.
async function requestJson(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${BASE}${path}`, { ...options, headers });
    return parseResponse(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot reach admin backend at ${BASE}. Make sure the Node server is running on port 4000.`);
    }
    throw error;
  }
}

export async function getAdminDashboard() {
  return requestJson("/api/admin/dashboard");
}

export async function getAdminVendors({ page = 1, pageSize = 10, status = "all", category = "all", sort = "default", q = "" }) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status,
    category,
    sort,
    q,
  });
  return requestJson(`/api/admin/vendors?${params}`);
}

export async function updateAdminVendor(id, payload) {
  return requestJson(`/api/admin/vendors/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getAdminAiRecords({ page = 1, pageSize = 5 }) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return requestJson(`/api/admin/ai-records?${params}`);
}

export async function submitAdminAiUrl(url) {
  return requestJson("/api/admin/ai/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export async function getAdminAiServiceStatus() {
  return requestJson("/api/admin/ai/service-status");
}

export async function getAdminSuggestions({ page = 1, pageSize = 10, status = "all", q = "" } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status, q });
  return requestJson(`/api/admin/suggestions?${params}`);
}

export async function getAdminSuggestion(id) {
  return requestJson(`/api/admin/suggestions/${id}`);
}

export async function updateAdminSuggestionStatus(id, payload) {
  return requestJson(`/api/admin/suggestions/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateAdminSuggestionsBatch(ids, status) {
  return requestJson(`/api/admin/suggestions/batch`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, status }),
  });
}

export async function processAdminSuggestion(id) {
  return requestJson(`/api/admin/suggestions/${id}/process`, { method: "POST" });
}

export async function getAdminSuggestionProcessing(id) {
  return requestJson(`/api/admin/suggestions/${id}/processing`);
}

export async function createAdminSuggestionDraft(id, payload) {
  return requestJson(`/api/admin/suggestions/${id}/create-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function publishAdminSuggestion(id) {
  return requestJson(`/api/admin/suggestions/${id}/publish`, { method: "POST" });
}

export async function createAdminVendor(payload) {
  return requestJson("/api/admin/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Read-only fuzzy scan for the "possible duplicates" review panel.
export async function getAdminVendorDuplicates() {
  return requestJson("/api/admin/vendors/duplicates");
}

export async function deleteAdminVendor(id) {
  return requestJson(`/api/admin/vendors/${id}`, {
    method: "DELETE",
  });
}

// Reuses Toh's existing image-upload endpoint (/api/vendors/:id/image) — both
// admin pages operate on the same `vendors` table row, no need for a second
// upload implementation under /api/admin.
export async function uploadVendorImage(id, file) {
  return requestJson(`/api/vendors/${id}/image`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
}

// Gallery photos (food/interior shots shown after the cover in the card-hover
// and detail-modal carousels). Unlike uploadVendorImage, this appends rather
// than replacing — each photo is removed individually by URL.
export async function uploadVendorGalleryImage(id, file) {
  return requestJson(`/api/vendors/${id}/gallery`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
}

export async function deleteVendorGalleryImage(id, url) {
  return requestJson(`/api/vendors/${id}/gallery`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

// Automatic photo discovery — preview only, downloads nothing server-side
// until commitVendorPhoto is called for the one candidate the admin picks.
// `coords`, when given a valid { latitude, longitude }, searches around that
// position instead of the vendor's saved one — lets an unsaved drag of the
// map marker (or a manual coordinate edit) feed the search immediately,
// without requiring Save Changes first.
export async function discoverVendorPhotos(id, coords) {
  const hasCoords = coords && coords.latitude !== "" && coords.latitude != null && coords.longitude !== "" && coords.longitude != null;
  return requestJson(`/api/vendors/${id}/photos/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hasCoords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
  });
}

// Same search, but for the Add Vendor form's first step — before a vendor
// row (and so a vendorId) exists yet. See the matching comment on
// POST /vendors/photos/discover-preview for why this doesn't need one.
export async function discoverVendorPhotosPreview({ vendor_name, address, cuisine_types, latitude, longitude }) {
  return requestJson("/api/vendors/photos/discover-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vendor_name, address, cuisine_types, latitude, longitude }),
  });
}

export async function commitVendorPhoto(id, { provider, photoRef, role, confidence, matchMeta, dedupeKey }) {
  return requestJson(`/api/vendors/${id}/photos/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, photoRef, role, confidence, matchMeta, dedupeKey }),
  });
}

export async function getAdminSettings() {
  return requestJson("/api/admin/settings");
}

export async function getAdminReviews({ page = 1, pageSize = 10, visibility = "all" }) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), visibility });
  return requestJson(`/api/admin/reviews?${params}`);
}

export async function setReviewVisibility(id, isHidden) {
  return requestJson(`/api/admin/reviews/${id}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_hidden: isHidden }),
  });
}

export async function getMyActivity({ page = 1, pageSize = 25, signal } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return requestJson(`/api/admin/me/activity?${params}`, { signal });
}

export async function getAdminUsers({ page = 1, pageSize = 10, q = "" }) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), q });
  return requestJson(`/api/admin/users?${params}`);
}

export async function getAdminUserActivity(id, { page = 1, pageSize = 50 } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return requestJson(`/api/admin/users/${id}/activity?${params}`);
}

// `duration` is one of "1d" | "1w" | "1m" | "1y" | "indefinite" | "none"
// (the last reactivates a previously suspended account). `reason` is
// required whenever duration isn't "none" — the backend rejects an empty one.
export async function suspendAdminUser(id, duration, reason = "") {
  return requestJson(`/api/admin/users/${id}/suspend`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ duration, reason }),
  });
}

export async function getAppealsPendingCount() {
  return requestJson("/api/admin/appeals/pending-count");
}

export async function getAppealDetail(id) {
  return requestJson(`/api/admin/appeals/${id}`);
}

// `decision` is "approve" (reactivates the account) or "reject" (leaves it suspended).
export async function decideAppeal(id, decision) {
  return requestJson(`/api/admin/appeals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}
