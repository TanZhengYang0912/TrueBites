import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Render deploys the Node API from the backend workspace", async () => {
  const config = await readFile(new URL("./render.yaml", import.meta.url), "utf8");

  assert.match(config, /^services:\r?\n  - type: web$/m);
  assert.match(config, /^    name: true-bites-backend$/m);
  assert.match(config, /^    runtime: node$/m);
  assert.match(config, /^    rootDir: backend$/m);
  assert.match(config, /^    buildCommand: npm ci$/m);
  assert.match(config, /^    startCommand: npm start$/m);
});

test("Render keeps backend credentials out of source control", async () => {
  const config = await readFile(new URL("./render.yaml", import.meta.url), "utf8");

  for (const key of ["GOOGLE_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "GROQ_API_KEY", "PUBLIC_BASE_URL"]) {
    assert.match(
      config,
      new RegExp(`^      - key: ${key}\\r?\\n        sync: false$`, "m"),
    );
  }
});
