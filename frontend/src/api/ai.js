import { supabase } from "../supabaseClient";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function authHeaders(extra = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseResponse(response) {
  if (response.ok) return response.json();

  let message = "Request failed";
  let payload = null;
  try {
    payload = await response.json();
    message = payload.detail || payload.error || message;
  } catch {
    message = await response.text();
  }
  const error = new Error(message || "Request failed");
  error.status = response.status;
  error.payload = payload;
  throw error;
}

// Every AI call attaches the signed-in admin's access token so the
// requireRole("admin") gate on /api/ai can verify the caller.
async function requestJson(path, options = {}) {
  const headers = await authHeaders(options.headers || {});
  try {
    const response = await fetch(`${BASE}${path}`, { ...options, headers });
    return parseResponse(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot reach the backend at ${BASE}. Make sure the Node server is running on port 4000.`);
    }
    throw error;
  }
}

function jsonBody(body) {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function validateUrl(url) {
  return requestJson("/api/ai/validate-url", { method: "POST", ...jsonBody({ url }) });
}

export async function startProcessing(url) {
  return requestJson("/api/ai/process", { method: "POST", ...jsonBody({ url }) });
}

export async function getJobStatus(jobId) {
  return requestJson(`/api/ai/status/${jobId}`);
}

export async function retryJob(jobId) {
  return requestJson(`/api/ai/retry/${jobId}`, { method: "POST" });
}

export async function createDraft(jobId, payload) {
  return requestJson(`/api/ai/create-draft/${jobId}`, { method: "POST", ...jsonBody(payload) });
}

export async function scrapeProfile(url, start, end) {
  return requestJson("/api/ai/scrape-profile", { method: "POST", ...jsonBody({ url, start, end }) });
}

export async function getScrapeStatus(scrapeId) {
  return requestJson(`/api/ai/scrape-status/${scrapeId}`);
}

export async function batchProcess(urls, profileUrl) {
  return requestJson("/api/ai/batch-process", { method: "POST", ...jsonBody({ urls, profile_url: profileUrl }) });
}

export async function getBatchStatus(batchId) {
  return requestJson(`/api/ai/batch-status/${batchId}`);
}

export async function saveToDatabase(vendors) {
  return requestJson("/api/ai/save-to-database", { method: "POST", ...jsonBody({ vendors }) });
}

// The export-csv route is behind requireRole("admin"), so a plain <a href>
// download won't carry the bearer token — fetch the blob ourselves and
// trigger the save via an object URL instead.
export async function downloadJobCsv(jobId, fallbackFilename = "export.csv") {
  const headers = await authHeaders();
  const response = await fetch(`${BASE}/api/ai/export-csv/${jobId}`, { headers });
  if (!response.ok) {
    await parseResponse(response);
    return;
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackFilename;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
