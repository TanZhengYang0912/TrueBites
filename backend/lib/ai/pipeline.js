// Orchestrates the 4-step AI pipeline (download -> transcribe -> summarize
// -> extract), job/batch/retry lifecycle, and the review/create-draft/
// save-to-database flows — port of backend/routes/process.py's business
// logic, minus the FastAPI route decorators (those live in routes/ai.js).
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { validateUrl } from "./urlValidation.js";
import { downloadAudio, scrapeProfile, OUTPUTS_DIR } from "./downloader.js";
import { transcribeAudio } from "./transcriber.js";
import { summarizeTranscript } from "./summarizer.js";
import { extractInfo, backfillFromSummary } from "./extractor.js";
import { createJob, updateJob, loadJob, createBatch, getBatchStatus, createScrapeJob, updateScrapeJob, getScrapeJob } from "./jobStore.js";
import { findDuplicateVendors, buildDraftVendorRow, attachAiThumbnail, upsertAiVendor, geocodeVendorAddress } from "./vendorPersistence.js";

// Node kills the whole process on an unhandled promise rejection — Python's
// BackgroundTasks only failed the one job. Every fire-and-forget pipeline
// call goes through this so a bug here can never take the server down.
function fireAndForget(promise, context) {
  promise.catch((err) => console.error(`[ai:${context}] unhandled error:`, err.stack || err.message));
}

// ── Core pipeline ───────────────────────────────────────────────────────

export async function runPipeline(jobId, url) {
  try {
    await updateJob(jobId, { status: "downloading", step: 1, step_label: "Downloading video audio...", progress: 10 });
    const download = await downloadAudio(url, jobId);
    await updateJob(jobId, { step: 1, step_label: "Download complete", progress: 25, title: download.title, thumbnail: download.thumbnail });

    await updateJob(jobId, { status: "transcribing", step: 2, step_label: "Transcribing audio with Whisper...", progress: 30 });
    const transcription = await transcribeAudio(download.audio_path);
    await fs.writeFile(path.join(OUTPUTS_DIR, jobId, "transcript.txt"), transcription.text);
    await updateJob(jobId, {
      step: 2, step_label: "Transcription complete", progress: 55,
      transcript: transcription.text, detected_language: transcription.language, segments: transcription.segments,
    });

    await updateJob(jobId, { status: "summarizing", step: 3, step_label: "Generating AI summary...", progress: 60 });
    const summary = await summarizeTranscript(transcription.text, { language: transcription.language, videoTitle: download.title });
    await fs.writeFile(path.join(OUTPUTS_DIR, jobId, "summary.txt"), summary);
    await updateJob(jobId, { step: 3, step_label: "Summary complete", progress: 80, summary });

    await updateJob(jobId, { status: "extracting", step: 4, step_label: "Extracting structured information...", progress: 85 });
    let extracted = await extractInfo(transcription.text, { summary, videoTitle: download.title });
    extracted = backfillFromSummary(extracted, summary);
    await fs.writeFile(path.join(OUTPUTS_DIR, jobId, "extraction.json"), JSON.stringify(extracted, null, 2));

    await updateJob(jobId, {
      step: 4, step_label: "Extraction complete", status: "completed", progress: 100,
      extracted, completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await updateJob(jobId, { status: "error", error: err.message, progress: 0 }).catch(() => {});
  }
}

export async function startProcessingJob(url) {
  const validation = validateUrl(url);
  if (!validation.valid) {
    const err = new Error(validation.error || "Invalid URL");
    err.status = 400;
    throw err;
  }
  const job = createJob({ url, platform: validation.platform });
  fireAndForget(runPipeline(job.job_id, url), "pipeline");
  return { job_id: job.job_id, status: "queued" };
}

export async function retryJob(jobId) {
  const job = await loadJob(jobId);
  if (!job) { const e = new Error("Job not found"); e.status = 404; throw e; }
  if (job.status !== "error") { const e = new Error("Only failed jobs can be retried"); e.status = 400; throw e; }

  const retryCount = (job.retry_count || 0) + 1;
  await updateJob(jobId, {
    status: "queued", step: 0, step_label: "Queued for retry", progress: 0,
    transcript: null, detected_language: null, segments: [], summary: null, extracted: null,
    error: null, completed_at: null, review_status: "pending", retry_count: retryCount,
  });
  fireAndForget(runPipeline(jobId, job.url), "pipeline-retry");
  return { job_id: jobId, status: "queued", retry_count: retryCount };
}

// ── Batch ────────────────────────────────────────────────────────────────

export async function startBatch(urls, profileUrl = "") {
  if (!urls?.length) { const e = new Error("No URLs provided"); e.status = 400; throw e; }
  if (urls.length > 1000) { const e = new Error("Maximum 1000 videos per batch"); e.status = 400; throw e; }

  const jobIds = [];
  const validUrls = [];
  for (const url of urls) {
    const validation = validateUrl(url);
    if (!validation.valid) continue; // skip invalid URLs, same as the Python original
    const job = createJob({ url, platform: validation.platform });
    jobIds.push(job.job_id);
    validUrls.push({ jobId: job.job_id, url });
  }

  const batch = createBatch({ jobIds, profileUrl });
  // Sequential, same as run_batch_pipeline — keeps Groq rate limits and CPU
  // load sane rather than firing every video's pipeline at once.
  fireAndForget(
    (async () => {
      for (const { jobId, url } of validUrls) await runPipeline(jobId, url);
    })(),
    "batch-pipeline"
  );

  return { batch_id: batch.batch_id, job_ids: jobIds, total: jobIds.length };
}

export { getBatchStatus };

// ── Profile scraping ─────────────────────────────────────────────────────

export function startScrape(url, { start, end } = {}) {
  const scrapeId = createScrapeJob();
  fireAndForget(
    scrapeProfile(url, { start, end })
      .then(({ videos, platform }) => updateScrapeJob(scrapeId, { status: "done", videos, count: videos.length, platform }))
      .catch((err) => updateScrapeJob(scrapeId, { status: "error", error: err.message })),
    "scrape"
  );
  return { scrape_id: scrapeId, status: "scraping" };
}

export { getScrapeJob as getScrapeStatus };

// ── Review / duplicate-check / create-draft ─────────────────────────────

const REVIEWABLE_FIELDS = new Set([
  "vendor_name", "address", "city", "state", "country", "price_range",
  "operating_hours_raw", "cuisine_types", "signature_dishes", "special_notes",
  "sentiment_score", "is_in_malacca",
]);

function mergeReviewedExtraction(job, extractedPatch) {
  const current = { ...(job.extracted || {}) };
  for (const [key, value] of Object.entries(extractedPatch || {})) {
    if (REVIEWABLE_FIELDS.has(key) && value !== null && value !== undefined) current[key] = value;
  }
  return current;
}

function isMalaccaLocation(extracted) {
  const location = ["address", "city", "state"].map((k) => String(extracted[k] || "")).join(" ").toLowerCase();
  if (location.includes("malacca") || location.includes("melaka")) return true;
  return Boolean(extracted.is_in_malacca);
}

export async function persistReview(jobId, summary, extractedPatch) {
  const job = await loadJob(jobId);
  if (!job) { const e = new Error("Job not found"); e.status = 404; throw e; }
  if (job.status !== "completed") { const e = new Error("Job is not ready for review"); e.status = 400; throw e; }

  const reviewedSummary = String(summary || "").trim();
  const reviewedExtracted = mergeReviewedExtraction(job, extractedPatch);
  reviewedExtracted.is_in_malacca = isMalaccaLocation(reviewedExtracted);

  await fs.mkdir(path.join(OUTPUTS_DIR, jobId), { recursive: true });
  await fs.writeFile(path.join(OUTPUTS_DIR, jobId, "summary.txt"), reviewedSummary);
  await fs.writeFile(path.join(OUTPUTS_DIR, jobId, "extraction.json"), JSON.stringify(reviewedExtracted, null, 2));

  return updateJob(jobId, {
    summary: reviewedSummary, extracted: reviewedExtracted,
    review_status: "reviewed", reviewed_at: new Date().toISOString(),
  });
}

export async function checkDuplicates(jobId, summary, extractedPatch) {
  const job = await loadJob(jobId);
  if (!job) { const e = new Error("Job not found"); e.status = 404; throw e; }
  if (job.status !== "completed") { const e = new Error("Job is not ready for duplicate checking"); e.status = 400; throw e; }

  const extracted = mergeReviewedExtraction(job, extractedPatch);
  const candidates = await findDuplicateVendors(extracted.vendor_name || "", extracted.address || "", extracted.city || "", extracted.state || "");
  return { job_id: jobId, candidates, has_duplicates: candidates.length > 0 };
}

export async function createDraftFromJob(jobId, { summary, extracted: extractedPatch, duplicate_acknowledged: acknowledged } = {}) {
  const job = await loadJob(jobId);
  if (!job) { const e = new Error("Job not found"); e.status = 404; throw e; }

  const reviewed = await persistReview(jobId, summary, extractedPatch);
  const extracted = reviewed.extracted || {};
  if (!isMalaccaLocation(extracted)) {
    const e = new Error("Only Malacca locations can be created as vendor drafts");
    e.status = 400;
    throw e;
  }

  const candidates = await findDuplicateVendors(extracted.vendor_name || "", extracted.address || "", extracted.city || "", extracted.state || "");
  if (candidates.length && !acknowledged) {
    return { job_id: jobId, status: "duplicate_review_required", candidates };
  }

  let vendorRow;
  try {
    const row = await buildDraftVendorRow(reviewed, extracted, reviewed.summary || "");
    vendorRow = await upsertAiVendor(row);
  } catch (err) {
    const e = new Error(`Draft vendor save failed: ${err.message}`);
    e.status = 502;
    throw e;
  }

  await attachAiThumbnail(vendorRow, reviewed.thumbnail);
  await updateJob(jobId, { review_status: "draft_created", draft_created_at: new Date().toISOString(), vendor_id: vendorRow?.id || null });

  return { job_id: jobId, status: "draft_created", vendor_id: vendorRow?.id || null, candidates };
}

// ── Batch save ───────────────────────────────────────────────────────────

export async function saveVendorsToDatabase(entries) {
  const saved = [];
  const failed = [];

  for (const entry of entries) {
    const job = await loadJob(entry.job_id);
    if (!job || job.status !== "completed") {
      failed.push({ job_id: entry.job_id, reason: "job not found or not completed" });
      continue;
    }

    const ext = job.extracted || {};
    if (!ext.is_in_malacca) {
      failed.push({ job_id: entry.job_id, reason: "not a Malacca location" });
      continue;
    }

    const vendorName = entry.vendor_name || ext.vendor_name;
    const address = entry.address || ext.address;
    const city = entry.city || ext.city;
    const state = entry.state || ext.state;
    if (!vendorName) {
      failed.push({ job_id: entry.job_id, reason: "missing vendor_name" });
      continue;
    }

    if (!entry.duplicate_acknowledged) {
      let dupCandidates;
      try {
        dupCandidates = await findDuplicateVendors(vendorName, address || "", city || "", state || "");
      } catch (err) {
        failed.push({ job_id: entry.job_id, reason: `duplicate check failed: ${err.message}` });
        continue;
      }
      if (dupCandidates.length) {
        failed.push({ job_id: entry.job_id, reason: "duplicate", candidates: dupCandidates });
        continue;
      }
    }

    const geo = await geocodeVendorAddress(vendorName, address || "", city || "", state || "");
    const platform = /tiktok/i.test(job.url || "") ? "TikTok" : "YouTube";

    const row = {
      vendor_name: vendorName,
      address: geo ? geo.formatted_address : address,
      city,
      state,
      latitude: geo ? geo.latitude : null,
      longitude: geo ? geo.longitude : null,
      location_precision: geo ? geo.precision : "unknown",
      cuisine_types: (ext.cuisine_types || []).join(", "),
      signature_dishes: (ext.signature_dishes || []).join(", "),
      price_range: entry.price_range || ext.price_range || null,
      sentiment_score: ext.sentiment_score ?? null,
      ai_review_summary: job.summary,
      operating_hours_raw: entry.operating_hours_raw || ext.operating_hours_raw || null,
      source_video_url: job.url,
      source_platform: platform,
      status: "draft",
      last_updated: new Date().toISOString(),
    };

    try {
      const vendorRow = await upsertAiVendor(row);
      await attachAiThumbnail(vendorRow, job.thumbnail);
      saved.push(entry.job_id);
    } catch (err) {
      failed.push({ job_id: entry.job_id, reason: err.message });
    }
  }

  return { saved, failed };
}
