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
  assert.match(dashboard, /Suggest a Hidden Gem|hidden gem/i);
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

test("AI route is redirected away from customers and admin suggestions has its own route", () => {
  const app = read("App.jsx");
  const admin = read("pages/admin/AdminSuggestionsPage.jsx");
  assert.match(app, /location\.pathname === \"\/ai\"/);
  assert.match(app, /path=\"\/ai\" element={<Navigate to=\"\/map\"/);
  assert.match(app, /path=\"suggestions\" element={<AdminSuggestionsPage \/>}/);
  assert.match(admin, /getAdminSuggestions/);
});
