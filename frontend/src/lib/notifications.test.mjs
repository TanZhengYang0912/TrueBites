import test from "node:test";
import assert from "node:assert/strict";
import { unreadCount, isUnread, NOTIFICATION_LIMIT } from "./notifications.js";

const AUG_10 = { id: "a", name: "Nasi Lemak Midang", published_at: "2026-08-10T02:00:00Z" };
const AUG_14 = { id: "b", name: "Midori Coffie",     published_at: "2026-08-14T02:00:00Z" };
const AUG_17 = { id: "c", name: "Chacos Berlauk",    published_at: "2026-08-17T02:00:00Z" };
const ALL = [AUG_17, AUG_14, AUG_10];

test("the bell is capped at fifteen", () => {
  assert.equal(NOTIFICATION_LIMIT, 15);
});

test("a user who has never opened the bell sees everything as unread", () => {
  assert.equal(unreadCount(ALL, null), 3);
  assert.equal(unreadCount(ALL, undefined), 3);
});

test("only vendors published after last-seen count as unread", () => {
  assert.equal(unreadCount(ALL, "2026-08-13T00:00:00Z"), 2);
  assert.equal(unreadCount(ALL, "2026-08-16T00:00:00Z"), 1);
  assert.equal(unreadCount(ALL, "2026-08-18T00:00:00Z"), 0);
});

test("a vendor published exactly at last-seen is already read", () => {
  assert.equal(unreadCount([AUG_14], "2026-08-14T02:00:00Z"), 0);
});

test("an empty feed has nothing unread", () => {
  assert.equal(unreadCount([], null), 0);
  assert.equal(unreadCount(undefined, null), 0);
});

test("an unparseable last-seen falls back to treating everything as unread", () => {
  assert.equal(unreadCount(ALL, "not a date"), 3);
});

test("a vendor with no publish date is never unread", () => {
  assert.equal(unreadCount([{ id: "d", name: "Draft", published_at: null }], null), 0);
  assert.equal(unreadCount([{ id: "d", name: "Draft", published_at: null }], "2026-08-01T00:00:00Z"), 0);
});

test("isUnread answers for a single notification", () => {
  assert.equal(isUnread(AUG_17, "2026-08-16T00:00:00Z"), true);
  assert.equal(isUnread(AUG_10, "2026-08-16T00:00:00Z"), false);
  assert.equal(isUnread(AUG_10, null), true);
});

test("a notification opened individually is read, whatever last-seen says", () => {
  assert.equal(isUnread(AUG_17, null, ["c"]), false);
  assert.equal(unreadCount(ALL, null, ["c"]), 2);
  assert.equal(unreadCount(ALL, null, ["c", "b", "a"]), 0);
});

test("opening one notification leaves the newer ones unread", () => {
  // The watermark can only say "everything before X" — read_ids is what lets a
  // middle item be read while a newer one is still unread.
  assert.equal(unreadCount(ALL, null, ["a"]), 2);
  assert.equal(isUnread(AUG_17, null, ["a"]), true);
  assert.equal(isUnread(AUG_10, null, ["a"]), false);
});

test("read ids are ignored when the item was already read by last-seen", () => {
  assert.equal(unreadCount(ALL, "2026-08-16T00:00:00Z", ["a"]), 1);
  assert.equal(unreadCount(ALL, "2026-08-16T00:00:00Z", ["c"]), 0);
});

test("a missing or junk read-id list is treated as nothing read", () => {
  assert.equal(unreadCount(ALL, null, undefined), 3);
  assert.equal(unreadCount(ALL, null, null), 3);
  assert.equal(unreadCount(ALL, null, "c"), 3);
});
