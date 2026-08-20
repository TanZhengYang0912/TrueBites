import { test } from "node:test";
import assert from "node:assert/strict";
import { selectImpersonateTarget } from "./binaries.js";

const FIXTURE = `[info] Available impersonate targets
Client          OS           Source
--------------------------------------
Chrome-133      Macos-15     curl_cffi
Chrome-99       Android-12   curl_cffi
Chrome-131      Android-14   curl_cffi
Chrome-119      Macos-14     curl_cffi
Chrome-120      Macos-14     curl_cffi
`;

test("selectImpersonateTarget: prefers Chrome-120 over 131/133 when all are present", () => {
  assert.equal(selectImpersonateTarget(FIXTURE), "Chrome-120");
});

test("selectImpersonateTarget: falls back to Chrome-131 when 120 is absent", () => {
  const withoutPreferred = FIXTURE.split("\n").filter((l) => !l.includes("Chrome-120")).join("\n");
  assert.equal(selectImpersonateTarget(withoutPreferred), "Chrome-131");
});

test("selectImpersonateTarget: falls back to the first listed target when none are preferred", () => {
  const noPreferred = "Chrome-99      Android-12   curl_cffi\nChrome-142     Macos-26     curl_cffi\n";
  assert.equal(selectImpersonateTarget(noPreferred), "Chrome-99");
});

test("selectImpersonateTarget: returns null for empty/no-target output", () => {
  assert.equal(selectImpersonateTarget(""), null);
  assert.equal(selectImpersonateTarget("ERROR: something broke"), null);
});
