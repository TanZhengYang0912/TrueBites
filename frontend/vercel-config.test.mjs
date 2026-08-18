import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vercel routes React Router URLs to the Vite entry point", async () => {
  const config = JSON.parse(
    await readFile(new URL("./vercel.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(config.rewrites, [
    { source: "/(.*)", destination: "/index.html" },
  ]);
});
