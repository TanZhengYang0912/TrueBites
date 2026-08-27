import test from "node:test";
import assert from "node:assert/strict";
import { applySuggestionListFilters, parseSuggestionListQuery, summarizeSuggestionCounts } from "./suggestionPagination.js";

test("clamps invalid page values and creates an inclusive range", () => {
  const query = parseSuggestionListQuery(new URLSearchParams("page=0&pageSize=999&type=creator&status=pending"));

  assert.deepEqual(query, {
    page: 1,
    pageSize: 12,
    type: "creator",
    status: "pending",
    from: 0,
    to: 11,
  });
});

test("normalizes unsupported filters and keeps the default page size", () => {
  const query = parseSuggestionListQuery(new URLSearchParams("page=-3&pageSize=nope&type=unknown&status=unknown"));

  assert.deepEqual(query, {
    page: 1,
    pageSize: 6,
    type: "all",
    status: "all",
    from: 0,
    to: 5,
  });
});

test("maps customer filters to ownership-safe query-builder operations", () => {
  const calls = [];
  const builder = {
    eq: (...args) => { calls.push(["eq", ...args]); return builder; },
    in: (...args) => { calls.push(["in", ...args]); return builder; },
    not: (...args) => { calls.push(["not", ...args]); return builder; },
  };

  applySuggestionListFilters(builder, { type: "vendor", status: "rejected" });
  assert.deepEqual(calls, [
    ["eq", "suggestion_type", "vendor"],
    ["in", "status", ["rejected", "failed", "duplicate"]],
  ]);

  calls.length = 0;
  applySuggestionListFilters(builder, { type: "all", status: "pending" });
  assert.deepEqual(calls, [["not", "status", "in", "(published,rejected,failed,duplicate)"]]);
});

test("summarizes type and status counts for the customer filter pills", () => {
  assert.deepEqual(summarizeSuggestionCounts([
    { suggestion_type: "vendor", status: "published" },
    { suggestion_type: "creator", status: "under_review" },
    { suggestion_type: "vendor", status: "duplicate" },
    { suggestion_type: "vendor", status: "needs_info" },
  ]), {
    types: { all: 4, vendor: 3, creator: 1 },
    statuses: { all: 4, pending: 2, published: 1, rejected: 1 },
  });
});
