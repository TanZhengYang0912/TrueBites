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
export async function discoverVendorPhotos(id) {
  return requestJson(`/api/vendors/${id}/photos/discover`, { method: "POST" });
}

export async function commitVendorPhoto(id, { provider, photoRef, role, confidence, matchMeta }) {
  return requestJson(`/api/vendors/${id}/photos/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, photoRef, role, confidence, matchMeta }),
  });
}

export async function getAdminSettings() {
  return requestJson("/api/admin/settings");
}

export async function getAdminReviews({ page = 1, pageSize = 10, visibility = "all" }) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), visibility });
  return requestJson(`/api/admin/reviews?${params}`);
}

// Superadmin-only — see requireSuperAdmin in backend/routes/admin.js.
export async function getAdminStaff() {
  return requestJson("/api/admin/staff");
}

export async function getAdminStaffActivity(id, { page = 1, pageSize = 50 } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return requestJson(`/api/admin/staff/${id}/activity?${params}`);
}

export async function createAdminStaff(email, permissions) {
  return requestJson("/api/admin/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, permissions }),
  });
}

export async function getAdminStaffDetail(id) {
  return requestJson(`/api/admin/staff/${id}`);
}

export async function setStaffStatus(id, status) {
  return requestJson(`/api/admin/staff/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function setStaffPermissions(id, permissions) {
  return requestJson(`/api/admin/staff/${id}/permissions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
}

export async function deleteAdminStaff(id) {
  return requestJson(`/api/admin/staff/${id}`, { method: "DELETE" });
}

export async function setReviewVisibility(id, isHidden) {
  return requestJson(`/api/admin/reviews/${id}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_hidden: isHidden }),
  });
}
