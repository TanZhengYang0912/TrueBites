import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const headerPath = new URL("../components/discovery/DiscoveryHeader.jsx", import.meta.url);

test("customer header falls back to initials when the avatar URL fails", async () => {
  const source = await readFile(headerPath, "utf8");

  assert.match(source, /useState/);
  assert.match(source, /avatarUrl && !imageFailed/);
  assert.match(source, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(source, /return initials/);
});
