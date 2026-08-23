import assert from "node:assert/strict";
import test from "node:test";

import { resolvePublicBaseUrl } from "./publicBaseUrl.js";

test("resolvePublicBaseUrl prefers the configured public URL", () => {
  assert.equal(
    resolvePublicBaseUrl({
      configuredBaseUrl: "https://api.truebites.my/",
      protocol: "https",
      host: "true-bites-backend.onrender.com",
    }),
    "https://api.truebites.my",
  );
});

test("resolvePublicBaseUrl uses the request host when no public URL is configured", () => {
  assert.equal(
    resolvePublicBaseUrl({
      protocol: "https",
      host: "true-bites-backend.onrender.com",
    }),
    "https://true-bites-backend.onrender.com",
  );
});
