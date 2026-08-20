// Job/batch/scrape state — port of the in-memory dicts + per-job disk
// mirror in backend/routes/process.py. Same two-tier read model as the
// Python original: an authoritative in-memory Map for speed, falling back
// to outputs/{job_id}/status.json on disk for a job that isn't in memory
// (e.g. after a restart) — reads survive a restart, in-flight pipelines do
// not (see reconcileAfterRestart below, which is new: the Python original
// had no equivalent, and a stuck "downloading" job with node --watch
// restarting far more often than uvicorn --reload did would otherwise poll
// forever for nothing).
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { OUTPUTS_DIR } from "./downloader.js";

const jobs = new Map();
const batches = new Map();
const scrapes = new Map();

// Per-job write serialization — Python's synchronous file writes couldn't
// interleave; Node's async ones can, so two updateJob() calls close
// together could otherwise race and write out of order.
const writeQueues = new Map();

function jobDir(jobId) {
  return path.join(OUTPUTS_DIR, jobId);
}
function statusPath(jobId) {
  return path.join(jobDir(jobId), "status.json");
}

async function persistJob(job) {
  await fs.mkdir(jobDir(job.job_id), { recursive: true });
  const prev = writeQueues.get(job.job_id) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => fs.writeFile(statusPath(job.job_id), JSON.stringify(job, null, 2)));
  writeQueues.set(job.job_id, next);
  return next;
}

export function createJob({ url, platform, batchId = null } = {}) {
  const job = {
    job_id: randomUUID(),
    url,
    platform,
    batch_id: batchId,
    status: "queued",
    step: 0,
    step_label: "Queued for processing",
    progress: 0,
    title: null,
    thumbnail: null,
    transcript: null,
    detected_language: null,
    segments: [],
    summary: null,
    extracted: null,
    error: null,
    review_status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  jobs.set(job.job_id, job);
  persistJob(job).catch((err) => console.error(`failed to persist job ${job.job_id}:`, err.message));
  return job;
}

export async function updateJob(jobId, patch) {
  const current = jobs.get(jobId) || (await loadJob(jobId));
  if (!current) throw new Error(`unknown job ${jobId}`);
  const updated = { ...current, ...patch };
  jobs.set(jobId, updated);
  await persistJob(updated);
  return updated;
}

export async function loadJob(jobId) {
  if (jobs.has(jobId)) return jobs.get(jobId);
  try {
    const raw = await fs.readFile(statusPath(jobId), "utf8");
    const job = JSON.parse(raw);
    jobs.set(jobId, job);
    return job;
  } catch {
    return null;
  }
}

export function createBatch({ jobIds, profileUrl = "" }) {
  const batch = { batch_id: randomUUID(), job_ids: jobIds, profile_url: profileUrl, total: jobIds.length, created_at: new Date().toISOString() };
  batches.set(batch.batch_id, batch);
  return batch;
}

export async function getBatchStatus(batchId) {
  const batch = batches.get(batchId);
  if (!batch) return null;
  const jobList = await Promise.all(batch.job_ids.map((id) => loadJob(id)));
  const found = jobList.filter(Boolean);
  return {
    batch_id: batch.batch_id,
    profile_url: batch.profile_url,
    total: batch.total,
    completed: found.filter((j) => j.status === "completed").length,
    failed: found.filter((j) => j.status === "error").length,
    in_progress: found.filter((j) => !["completed", "error"].includes(j.status)).length,
    jobs: found,
  };
}

export function createScrapeJob() {
  const scrapeId = randomUUID();
  scrapes.set(scrapeId, { scrape_id: scrapeId, status: "scraping", videos: [], count: 0, platform: null, error: null });
  return scrapeId;
}
export function updateScrapeJob(scrapeId, patch) {
  const current = scrapes.get(scrapeId);
  if (!current) return;
  scrapes.set(scrapeId, { ...current, ...patch });
}
export function getScrapeJob(scrapeId) {
  return scrapes.get(scrapeId) || null;
}

// ── Restart reconciliation ──────────────────────────────────────────────
// On boot, any on-disk job stuck in a non-terminal status is almost
// certainly one whose in-memory pipeline died with the previous process —
// nothing will ever move it forward again. Mark it as an error rather than
// leaving the frontend polling a job that can never complete.
const NON_TERMINAL = new Set(["queued", "downloading", "transcribing", "summarizing", "extracting"]);

export async function reconcileAfterRestart() {
  if (!existsSync(OUTPUTS_DIR)) return;
  const entries = await fs.readdir(OUTPUTS_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const job = await loadJob(entry.name).catch(() => null);
    if (job && NON_TERMINAL.has(job.status)) {
      await updateJob(job.job_id, {
        status: "error",
        error: "Server restarted while this job was running — click Retry.",
      }).catch(() => {});
    }
  }
}

// ── TTL cleanup ──────────────────────────────────────────────────────────
// The Python original never cleaned up backend/outputs/ at all — over a
// thousand job directories had accumulated on disk with no TTL of any kind.
async function sweepOnce(ttlMs) {
  if (!existsSync(OUTPUTS_DIR)) return;
  const entries = await fs.readdir(OUTPUTS_DIR, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(OUTPUTS_DIR, entry.name);
    const stat = await fs.stat(dirPath).catch(() => null);
    if (!stat) continue;
    if (now - stat.mtimeMs < ttlMs) continue;

    // Never delete a directory whose job is still actively running.
    const job = jobs.get(entry.name);
    if (job && NON_TERMINAL.has(job.status)) continue;

    await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    jobs.delete(entry.name);
  }
}

export function startOutputsSweeper({ ttlHours = Number(process.env.AI_OUTPUTS_TTL_HOURS) || 24, intervalMs = 60 * 60 * 1000 } = {}) {
  const ttlMs = ttlHours * 60 * 60 * 1000;
  sweepOnce(ttlMs).catch((err) => console.error("outputs sweep failed:", err.message));
  const timer = setInterval(() => sweepOnce(ttlMs).catch((err) => console.error("outputs sweep failed:", err.message)), intervalMs);
  timer.unref();
  return timer;
}
