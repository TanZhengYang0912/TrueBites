import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const charts = readFileSync(new URL("../components/admin/AdminCharts.jsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../pages/admin/AdminDashboardPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../global.css", import.meta.url), "utf8");

function sourceBetween(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  return source.slice(startAt, endAt);
}

test("dashboard KPI cards keep their number content without trend decoration", () => {
  const kpiCard = sourceBetween(charts, "export function KpiCard", "export function Delta");
  assert.match(kpiCard, /admin-kpi-label/);
  assert.match(kpiCard, /admin-kpi-value/);
  assert.match(kpiCard, /item\.note/);
  assert.doesNotMatch(kpiCard, /Sparkline|MoreHorizontal|admin-kpi-action/);
});

test("admin dashboard no longer computes or passes KPI sparklines", () => {
  assert.doesNotMatch(dashboard, /const sparkline\s*=/);
  assert.doesNotMatch(dashboard, /sparkline=\{/);
  assert.doesNotMatch(styles, /\.admin-sparkline/);
});
