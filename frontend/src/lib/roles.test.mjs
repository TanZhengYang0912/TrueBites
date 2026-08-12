import test from "node:test";
import assert from "node:assert/strict";
import { isAdmin, isSuperAdmin, customerSession, hasPermission } from "./roles.js";

const adminSession = { user: { id: "a1", app_metadata: { role: "admin" } } };
const superAdminSession = { user: { id: "s1", app_metadata: { role: "superadmin" } } };
const customer = { user: { id: "c1", app_metadata: {} } };
const restrictedAdminSession = { user: { id: "a2", app_metadata: { role: "admin", permissions: ["vendors"] } } };

test("isAdmin reads the server-controlled role", () => {
  assert.equal(isAdmin(adminSession), true);
  assert.equal(isAdmin(customer), false);
});

test("isAdmin treats superadmin as a superset of admin", () => {
  assert.equal(isAdmin(superAdminSession), true);
});

test("isSuperAdmin is true only for the superadmin role", () => {
  assert.equal(isSuperAdmin(superAdminSession), true);
  assert.equal(isSuperAdmin(adminSession), false);
  assert.equal(isSuperAdmin(customer), false);
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

test("hasPermission defaults to full access when permissions is not customized", () => {
  assert.equal(hasPermission(adminSession, "vendors"), true);
  assert.equal(hasPermission(adminSession, "settings"), true);
});

test("hasPermission respects an explicit permissions list", () => {
  assert.equal(hasPermission(restrictedAdminSession, "vendors"), true);
  assert.equal(hasPermission(restrictedAdminSession, "settings"), false);
});

test("hasPermission grants superadmin everything regardless of permissions", () => {
  assert.equal(hasPermission(superAdminSession, "settings"), true);
});

test("hasPermission is false without a session", () => {
  assert.equal(hasPermission(null, "vendors"), false);
  assert.equal(hasPermission(undefined, "vendors"), false);
});
