import { supabase } from "../supabaseClient";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function authHeaders(extra = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: await authHeaders(options.headers || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.details || payload.error || "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function createSuggestion(payload) {
  return requestJson("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getMySuggestions() {
  return requestJson("/api/suggestions/mine");
}

export function getMySuggestion(id) {
  return requestJson(`/api/suggestions/${id}`);
}

export function updateSuggestion(id, payload) {
  return requestJson(`/api/suggestions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

