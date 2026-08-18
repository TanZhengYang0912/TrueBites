import { supabase } from "../supabaseClient";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function parseResponse(response) {
  if (response.ok) return response.json();

  let message = "Request failed";
  try {
    const payload = await response.json();
    message = payload.details || payload.error || message;
  } catch {
    message = await response.text();
  }
  throw new Error(message || "Request failed");
}

async function authHeaders(extra = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function requestJson(path, options) {
  try {
    const response = await fetch(`${BASE}${path}`, options);
    return parseResponse(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot reach backend at ${BASE}. Make sure the Node server is running on port 4000.`);
    }
    throw error;
  }
}

const jsonBody = (payload) => ({ "Content-Type": "application/json", body: JSON.stringify(payload) });

// ── Folders ──
export async function getFolders() {
  return requestJson("/api/engagement/folders", { headers: await authHeaders() });
}
export async function createFolder(name) {
  const { "Content-Type": ct, body } = jsonBody({ name });
  return requestJson("/api/engagement/folders", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": ct }),
    body,
  });
}
export async function deleteFolder(id) {
  return requestJson(`/api/engagement/folders/${id}`, { method: "DELETE", headers: await authHeaders() });
}

// ── Bookmarks ──
export async function getBookmarks() {
  return requestJson("/api/engagement/bookmarks", { headers: await authHeaders() });
}
export async function addBookmark(vendorId, folderId) {
  const { "Content-Type": ct, body } = jsonBody({ vendor_id: vendorId, folder_id: folderId || null });
  return requestJson("/api/engagement/bookmarks", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": ct }),
    body,
  });
}
export async function moveBookmark(vendorId, folderId) {
  const { "Content-Type": ct, body } = jsonBody({ folder_id: folderId });
  return requestJson(`/api/engagement/bookmarks/${vendorId}`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": ct }),
    body,
  });
}
export async function removeBookmark(vendorId) {
  return requestJson(`/api/engagement/bookmarks/${vendorId}`, { method: "DELETE", headers: await authHeaders() });
}

// ── Reviews ──
export async function getReviews(vendorId) {
  return requestJson(`/api/engagement/vendors/${vendorId}/reviews`, { headers: await authHeaders() });
}
export async function getMyReviews() {
  return requestJson("/api/engagement/reviews/mine", { headers: await authHeaders() });
}
export async function createReview(vendorId, { rating, body, is_anonymous }) {
  const payload = jsonBody({ rating, body, is_anonymous });
  return requestJson(`/api/engagement/vendors/${vendorId}/reviews`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": payload["Content-Type"] }),
    body: payload.body,
  });
}
export async function updateReview(id, { rating, body, is_anonymous }) {
  const payload = jsonBody({ rating, body, is_anonymous });
  return requestJson(`/api/engagement/reviews/${id}`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": payload["Content-Type"] }),
    body: payload.body,
  });
}
export async function deleteReview(id) {
  return requestJson(`/api/engagement/reviews/${id}`, { method: "DELETE", headers: await authHeaders() });
}
export async function uploadReviewPhoto(reviewId, file) {
  return requestJson(`/api/engagement/reviews/${reviewId}/photo`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": file.type }),
    body: file,
  });
}

// ── Votes ──
export async function voteReview(id, isLike) {
  const { "Content-Type": ct, body } = jsonBody({ is_like: isLike });
  return requestJson(`/api/engagement/reviews/${id}/vote`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": ct }),
    body,
  });
}
export async function removeVote(id) {
  return requestJson(`/api/engagement/reviews/${id}/vote`, { method: "DELETE", headers: await authHeaders() });
}
