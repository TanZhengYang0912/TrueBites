import test from "node:test";
import assert from "node:assert/strict";
import { isAdmin, customerSession } from "./roles.js";

const adminSession = { user: { id: "a1", app_metadata: { role: "admin" } } };
const customer = { user: { id: "c1", app_metadata: {} } };

test("isAdmin reads the server-controlled role", () => {
  assert.equal(isAdmin(adminSession), true);
  assert.equal(isAdmin(customer), false);
});

test("isAdmin is false for missing or empty sessions", () => {
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
  assert.equal(isAdmin({}), false);
  assert.equal(isAdmin({ user: {} }), false);
});

test("isAdmin ignores user_metadata, which the user controls", () => {
  assert.equal(isAdmin({ user: { app_metadata: {}, user_metadata: { role: "admin" } } }), false);
});

test("customerSession hides an admin session and passes a customer through", () => {
  assert.equal(customerSession(adminSession), null);
  assert.equal(customerSession(customer), customer);
  assert.equal(customerSession(null), null);
});
