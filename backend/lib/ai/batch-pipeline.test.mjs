import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Importing the pipeline also initializes its Supabase client. These tests use
// an injected runner, so only inert configuration is needed, never real keys.
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_KEY = "ci-test-service-key";
const { runBatchPipelines } = await import("./pipeline.js");

test("batch processing does not serialize every video behind one slow pipeline", async () => {
  const source = await fs.readFile(new URL("./pipeline.js", import.meta.url), "utf8");

  assert.doesNotMatch(
    source,
    /for\s*\(const\s*\{\s*jobId,\s*url\s*\}\s*of\s*validUrls\)\s*await\s+runPipeline/,
    "a slow download must not block every later batch video"
  );
});

test("batch processing runs jobs with a bounded concurrency", async () => {
  const started = [];
  let active = 0;
  let maxActive = 0;

  await runBatchPipelines(
    ["one", "two", "three", "four"].map((jobId) => ({ jobId, url: `https://example.com/${jobId}` })),
    {
      concurrency: 2,
      runner: async (jobId) => {
        started.push(jobId);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
      },
    }
  );

  assert.equal(maxActive, 2);
  assert.deepEqual(new Set(started), new Set(["one", "two", "three", "four"]));
});
