import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.join(here, "..", relativePath), "utf8");

test("customer suggestion routes and dashboard CTA are wired", () => {
  const app = read("App.jsx");
  const dashboard = read("components/Dashboard.jsx");
  assert.match(app, /path=\"\/suggestions\"/);
  assert.match(app, /path=\"\/suggestions\/new\"/);
  assert.match(dashboard, /navigate\(\"\/suggestions\/new\"\)/);
  assert.match(dashboard, /Community discoveries/i);
});

test("customer suggestion pages do not call the AI service directly", () => {
  const formPage = read("pages/SuggestionFormPage.jsx");
  const listPage = read("pages/SuggestionsPage.jsx");
  const api = read("api/suggestions.js");
  assert.doesNotMatch(formPage, /8000|AI_BASE|getAiApiBase|\/process/);
  assert.doesNotMatch(listPage, /8000|AI_BASE|getAiApiBase|\/process/);
  assert.match(api, /Authorization/);
  assert.match(api, /\/api\/suggestions/);
});

test("the new suggestion form offers a real back action", () => {
  const formPage = read("pages/SuggestionFormPage.jsx");

  assert.match(formPage, /ArrowLeft/);
  assert.match(formPage, /location\.key === "default"/);
  assert.match(formPage, /navigate\(-1\)/);
  assert.match(formPage, /navigate\("\/suggestions"\)/);
  assert.doesNotMatch(formPage, />My suggestions</);
});

test("suggestion flow supports vendor and creator types in one admin publication flow", () => {
  const form = read("components/suggestions/SuggestionForm.jsx");
  const adminDetail = read("components/admin/SuggestionDetailModal.jsx");
  const adminRoute = fs.readFileSync(path.join(here, "..", "..", "..", "backend", "routes", "adminSuggestions.js"), "utf8");
  const adminApi = read("api/admin.js");
  const app = read("App.jsx");
  const suggestions = read("pages/SuggestionsPage.jsx");
  const footer = read("components/Footer.jsx");
  const migration = fs.readFileSync(path.join(here, "..", "..", "..", "supabase", "migrations", "202608270001_generalize_community_suggestions.sql"), "utf8");

  assert.match(form, /suggestion_type/);
  assert.match(form, /active \? "border-forest bg-forest\/8 text-forest translate-y-1"/);
  assert.match(form, /creator_profile_url/);
  assert.match(form, /creator_focus/);
  assert.match(adminDetail, /publishAdminSuggestion/);
  assert.match(adminDetail, /Publish suggestion/);
  assert.doesNotMatch(adminDetail, /publish-creator|Publish creator/);
  assert.doesNotMatch(adminRoute, /publish-creator|from\("creators"\)/);
  assert.doesNotMatch(adminApi, /publishAdminCreatorSuggestion|publish-creator/);
  assert.doesNotMatch(app, /CreatorsPage|\/creators/);
  assert.doesNotMatch(suggestions, /Explore creators|\/creators/);
  assert.doesNotMatch(footer, /Creators/);
  assert.doesNotMatch(migration, /create table if not exists public\.creators|creator_id/);
});

test("AI route is redirected away from customers and admin suggestions has its own route", () => {
  const app = read("App.jsx");
  const admin = read("pages/admin/AdminSuggestionsPage.jsx");
  assert.match(app, /location\.pathname === \"\/ai\"/);
  assert.match(app, /path=\"\/ai\" element={<Navigate to=\"\/discover\"/);
  assert.match(app, /path=\"suggestions\" element={<AdminSuggestionsPage \/>}/);
  assert.match(admin, /getAdminSuggestions/);
});
