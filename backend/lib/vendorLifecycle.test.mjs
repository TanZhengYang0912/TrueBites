import test from "node:test";
import assert from "node:assert/strict";
import {
  NEW_VENDOR_NOTIFICATION,
  VENDOR_REACTIVATED_NOTIFICATION,
  notificationTypeForActivation,
} from "./vendorLifecycle.js";

const classify = (previousStatus, nextStatus, publishedAt = null) =>
  notificationTypeForActivation({ previousStatus, nextStatus, publishedAt });

test("first activation is a new-vendor event", () => {
  assert.equal(classify("draft", "active"), NEW_VENDOR_NOTIFICATION);
  assert.equal(classify("suspended", "active"), NEW_VENDOR_NOTIFICATION);
});

test("a previously published suspended vendor is reactivated", () => {
  assert.equal(
    classify("suspended", "active", "2026-08-27T07:57:50.865948Z"),
    VENDOR_REACTIVATED_NOTIFICATION,
  );
});

test("saving an active vendor or moving away from active emits nothing", () => {
  const publishedAt = "2026-08-27T07:57:50.865948Z";
  assert.equal(classify("active", "active", publishedAt), null);
  assert.equal(classify("active", "suspended", publishedAt), null);
  assert.equal(classify("draft", "suspended"), null);
});
