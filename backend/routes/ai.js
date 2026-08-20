import { Router } from "express";
import { validateUrl } from "../lib/ai/urlValidation.js";
import { loadJob } from "../lib/ai/jobStore.js";
import {
  startProcessingJob, retryJob, startBatch, getBatchStatus,
  startScrape, getScrapeStatus, createDraftFromJob, saveVendorsToDatabase,
} from "../lib/ai/pipeline.js";
import { buildJobCsv } from "../lib/ai/csvExport.js";
import { ytDlp } from "../lib/ai/binaries.js";

const router = Router();

// Mirrors FastAPI's {"detail": "..."} shape on every error response — the
// frontend and adminSuggestions.js both already read err.detail (some also
// fall back to err.error), so keeping both keys means neither needed to
// change when this moved from Python to Node.
function fail(res, status, message) {
  res.status(status).json({ detail: message, error: message });
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      fail(res, err.status || 500, err.message || "Unexpected error");
    }
  };
}

router.get("/health", (req, res) => res.json({ status: "ok", service: "AI Content Processing Module" }));

router.post("/validate-url", handle(async (req, res) => {
  res.json(validateUrl(req.body?.url));
}));

router.post("/process", handle(async (req, res) => {
  res.json(await startProcessingJob(req.body?.url));
}));

router.get("/status/:jobId", handle(async (req, res) => {
  const job = await loadJob(req.params.jobId);
  if (!job) return fail(res, 404, "Job not found");
  res.json(job);
}));

router.post("/retry/:jobId", handle(async (req, res) => {
  res.json(await retryJob(req.params.jobId));
}));

router.post("/create-draft/:jobId", handle(async (req, res) => {
  res.json(await createDraftFromJob(req.params.jobId, req.body || {}));
}));

router.post("/scrape-profile", handle(async (req, res) => {
  const { url, start, end } = req.body || {};
  res.json(startScrape(url, { start, end }));
}));

router.get("/scrape-status/:scrapeId", handle(async (req, res) => {
  const job = getScrapeStatus(req.params.scrapeId);
  if (!job) return fail(res, 404, "Scrape job not found");
  res.json(job);
}));

router.post("/batch-process", handle(async (req, res) => {
  const { urls, profile_url: profileUrl } = req.body || {};
  res.json(await startBatch(urls, profileUrl));
}));

router.get("/batch-status/:batchId", handle(async (req, res) => {
  const status = await getBatchStatus(req.params.batchId);
  if (!status) return fail(res, 404, "Batch not found");
  res.json(status);
}));

router.get("/export-csv/:jobId", handle(async (req, res) => {
  const job = await loadJob(req.params.jobId);
  if (!job) return fail(res, 404, "Job not found");
  if (job.status !== "completed") return fail(res, 400, "Job not yet completed");

  const { filename, buffer } = buildJobCsv(job);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}));

router.post("/save-to-database", handle(async (req, res) => {
  res.json(await saveVendorsToDatabase(req.body?.vendors || []));
}));

// Replaces the old proxy-to-Python "/ai/service-status" concept — now a
// genuinely useful "is the AI toolchain actually installed" probe, since
// there's no longer a separate service to ask.
router.get("/toolchain-status", handle(async (req, res) => {
  const version = await ytDlp(["--version"], { timeoutMs: 10_000 });
  res.json({
    available: true,
    ytDlp: version.code === 0 ? version.stdout.trim() : null,
    groq: Boolean(process.env.GROQ_API_KEY),
  });
}));

export default router;
