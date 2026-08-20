import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createJob, updateJob, loadJob } from "./jobStore.js";
import { OUTPUTS_DIR } from "./downloader.js";

test("createJob: initial shape matches the documented job contract", () => {
  const job = createJob({ url: "https://tiktok.com/x", platform: "tiktok" });
  assert.equal(job.status, "queued");
  assert.equal(job.step, 0);
  assert.equal(job.progress, 0);
  assert.equal(job.review_status, "pending");
  assert.equal(job.retry_count, 0);
  assert.deepEqual(job.segments, []);
  assert.ok(job.job_id);
});

test("updateJob + loadJob: round-trips through the in-memory Map", async () => {
  const job = createJob({ url: "https://tiktok.com/x", platform: "tiktok" });
  await updateJob(job.job_id, { status: "downloading", progress: 10 });
  const reloaded = await loadJob(job.job_id);
  assert.equal(reloaded.status, "downloading");
  assert.equal(reloaded.progress, 10);
});

test("updateJob: persists to outputs/{job_id}/status.json on disk", async () => {
  const job = createJob({ url: "https://tiktok.com/x", platform: "tiktok" });
  await updateJob(job.job_id, { status: "completed", progress: 100 });

  // Give the internal write queue a tick to flush.
  await new Promise((r) => setTimeout(r, 50));

  const raw = await fs.readFile(path.join(OUTPUTS_DIR, job.job_id, "status.json"), "utf8");
  const onDisk = JSON.parse(raw);
  assert.equal(onDisk.status, "completed");
  assert.equal(onDisk.progress, 100);

  await fs.rm(path.join(OUTPUTS_DIR, job.job_id), { recursive: true, force: true });
});

test("loadJob: returns null for a job that was never created", async () => {
  assert.equal(await loadJob("does-not-exist-" + Date.now()), null);
});
