import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileDown,
  MessageSquareWarning,
  Store,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getAdminDashboard } from "../../api/admin";
import { normalizeDashboardPayload, statusToneFor } from "../../lib/adminDashboard";
import { buildDashboardReport, DASHBOARD_COPY } from "../../lib/dashboardReport";
import { BarChart, KpiCard, LineChart, PipelineChart } from "../../components/admin/AdminCharts";
import { openOverviewPdf } from "../../lib/exportPdf";

const KPI_ICONS = {
  totalVendors: Store,
  activeRate: CheckCircle2,
  pendingDrafts: ClipboardCheck,
  aiImported: BrainCircuit,
  reviews: MessageSquareWarning,
};

const rangeOptions = [7, 30, 90];

function DashboardSkeleton() {
  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-heading admin-skeleton-heading" />
      <section className="admin-kpi-grid">
        {Array.from({ length: 5 }).map((_, index) => <article key={index} className="admin-kpi-card admin-skeleton-card" />)}
      </section>
      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-chart-panel admin-span-8 admin-skeleton-panel" />
        <article className="admin-panel admin-chart-panel admin-span-4 admin-skeleton-panel" />
      </section>
    </div>
  );
}

function AttentionQueue({ items }) {
  return (
    <section className="admin-panel admin-attention-panel admin-span-4">
      <div className="admin-panel-header">
        <div>
          <h2>{DASHBOARD_COPY.attention.title}</h2>
          <p>{DASHBOARD_COPY.attention.subtitle}</p>
        </div>
        <AlertTriangle size={17} className="admin-panel-heading-icon" />
      </div>
      <div className="admin-attention-list">
        {items.length ? items.map((item) => (
          <Link className="admin-attention-row" to={item.href || "/admin"} key={item.id}>
            <span className={`admin-attention-dot ${item.tone || "neutral"}`} />
            <span className="admin-attention-copy">{item.label}</span>
            <strong>{item.value}</strong>
            <ArrowRight size={15} />
          </Link>
        )) : (
          <div className="admin-empty-state">
            <CheckCircle2 size={20} />
            <span>{DASHBOARD_COPY.attention.empty}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityPanel({ rows }) {
  return (
    <section className="admin-panel admin-activity-panel admin-span-12">
      <div className="admin-panel-header">
        <div>
          <h2>{DASHBOARD_COPY.activity.title}</h2>
          <p>{DASHBOARD_COPY.activity.subtitle}</p>
        </div>
        <Database size={17} className="admin-panel-heading-icon" />
      </div>
      <div className="admin-activity-table">
        <div className="admin-activity-table-head"><span>Type</span><span>Item</span><span>Status</span><span /></div>
        {rows.length ? rows.map((row) => (
          <Link className="admin-activity-row" to={row.href} key={row.id}>
            <span className="admin-activity-type">{row.type}</span>
            <span><strong>{row.title || "Untitled"}</strong><small>{row.meta}</small></span>
            <span className={`admin-status-pill ${statusToneFor(row.status)}`}>{row.status || "Updated"}</span>
            <ArrowRight size={15} />
          </Link>
        )) : <div className="admin-empty-state">{DASHBOARD_COPY.activity.empty}</div>}
      </div>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState(30);
  const [exportingOverview, setExportingOverview] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    let active = true;
    getAdminDashboard()
      .then((payload) => { if (active) setData(normalizeDashboardPayload(payload)); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const report = useMemo(() => (data ? buildDashboardReport(data, range) : null), [data, range]);

  if (error) return <div className="admin-feedback error">{error}</div>;
  if (!data) return <DashboardSkeleton />;

  async function handleExportOverview() {
    setExportingOverview(true);
    setExportError("");
    try {
      await openOverviewPdf(report);
    } catch (err) {
      setExportError(err?.message || "Unable to export the dashboard PDF. Please try again.");
    } finally {
      setExportingOverview(false);
    }
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-heading">
        <div>
          <div className="admin-eyebrow">{report.heading.eyebrow}</div>
          <h2>{report.heading.title}</h2>
          <p>{report.heading.subtitle}</p>
        </div>
        <div className="admin-dashboard-actions">
          <span className="admin-last-updated">{report.heading.updated}</span>
          <button type="button" className="admin-secondary-btn compact" onClick={handleExportOverview} disabled={exportingOverview}>
            <FileDown size={14} /> {exportingOverview ? "Preparing PDF…" : "Export PDF"}
          </button>
          <Link className="admin-secondary-btn compact" to="/admin/reviews"><MessageSquareWarning size={14} /> Review queue</Link>
          <Link className="admin-primary-btn compact" to="/admin/vendors2"><Store size={14} /> Add vendor</Link>
          {exportError && <div className="admin-feedback error" role="alert">{exportError}</div>}
        </div>
      </div>

      <section className="admin-kpi-grid">
        {report.kpis.map((item) => {
          const Icon = KPI_ICONS[item.key] || BarChart3;
          return <KpiCard key={item.key || item.label} item={item} icon={Icon} />;
        })}
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-chart-panel admin-span-8">
          <div className="admin-panel-header">
            <div><h2>{DASHBOARD_COPY.growth.title}</h2><p>{DASHBOARD_COPY.growth.subtitle}</p></div>
            <div className="admin-range-control" role="group" aria-label="Vendor growth range">
              {rangeOptions.map((option) => <button key={option} type="button" className={range === option ? "active" : ""} onClick={() => setRange(option)}>{option}d</button>)}
            </div>
          </div>
          <LineChart data={report.trend} rangeLabel={report.rangeLabel} emptyLabel={DASHBOARD_COPY.growth.empty} />
        </article>

        <AttentionQueue items={report.attentionItems} />

        <article className="admin-panel admin-chart-panel admin-span-5">
          <div className="admin-panel-header"><div><h2>{DASHBOARD_COPY.pipeline.title}</h2><p>{DASHBOARD_COPY.pipeline.subtitle}</p></div><BrainCircuit size={17} className="admin-panel-heading-icon" /></div>
          <PipelineChart data={report.aiPipeline} emptyLabel={DASHBOARD_COPY.pipeline.empty} />
        </article>

        <article className="admin-panel admin-chart-panel admin-span-4">
          <div className="admin-panel-header"><div><h2>{DASHBOARD_COPY.categories.title}</h2><p>{DASHBOARD_COPY.categories.subtitle}</p></div><Store size={17} className="admin-panel-heading-icon" /></div>
          <BarChart data={report.categoryBreakdown} emptyLabel={DASHBOARD_COPY.categories.empty} />
        </article>

        <article className="admin-panel admin-chart-panel admin-span-3">
          <div className="admin-panel-header"><div><h2>{DASHBOARD_COPY.sources.title}</h2><p>{DASHBOARD_COPY.sources.subtitle}</p></div><BarChart3 size={17} className="admin-panel-heading-icon" /></div>
          <BarChart data={report.sourceBreakdown} tone="teal" emptyLabel={DASHBOARD_COPY.sources.empty} />
        </article>

        <ActivityPanel rows={report.activityRows} />
      </section>
    </div>
  );
}
