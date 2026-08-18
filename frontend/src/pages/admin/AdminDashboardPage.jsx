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
import { normalizeDashboardPayload } from "../../lib/adminDashboard";
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

function KpiFallback({ stat, index }) {
  const fallbackKeys = ["totalVendors", "activeRate", "pendingDrafts", "aiImported"];
  return {
    key: fallbackKeys[index] || `stat-${index}`,
    label: stat.label,
    value: stat.value,
    note: stat.note,
    tone: stat.tone,
  };
}

function AttentionQueue({ items }) {
  return (
    <section className="admin-panel admin-attention-panel admin-span-4">
      <div className="admin-panel-header">
        <div>
          <h2>Needs attention</h2>
          <p>Items that need an admin decision</p>
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
            <span>No immediate issues.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityPanel({ vendors = [], processing = [] }) {
  const rows = [
    ...vendors.slice(0, 4).map((vendor) => ({
      id: `vendor-${vendor.id}`,
      type: "Vendor",
      title: vendor.name,
      meta: `${vendor.category} · ${vendor.location}`,
      status: vendor.status,
      href: "/admin/vendors2",
    })),
    ...processing.slice(0, 4).map((item) => ({
      id: `ai-${item.id}`,
      type: item.platform,
      title: item.vendor,
      meta: item.recommendation,
      status: "AI imported",
      href: "/admin/ai",
    })),
  ].slice(0, 6);

  return (
    <section className="admin-panel admin-activity-panel admin-span-12">
      <div className="admin-panel-header">
        <div>
          <h2>Recent activity</h2>
          <p>Latest changes across the admin console</p>
        </div>
        <Database size={17} className="admin-panel-heading-icon" />
      </div>
      <div className="admin-activity-table">
        <div className="admin-activity-table-head"><span>Type</span><span>Item</span><span>Status</span><span /></div>
        {rows.length ? rows.map((row) => (
          <Link className="admin-activity-row" to={row.href} key={row.id}>
            <span className="admin-activity-type">{row.type}</span>
            <span><strong>{row.title || "Untitled"}</strong><small>{row.meta}</small></span>
            <span className="admin-status-pill active">{row.status || "Updated"}</span>
            <ArrowRight size={15} />
          </Link>
        )) : <div className="admin-empty-state">No recent activity yet.</div>}
      </div>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState(30);
  const [exportingOverview, setExportingOverview] = useState(false);

  useEffect(() => {
    let active = true;
    getAdminDashboard()
      .then((payload) => { if (active) setData(normalizeDashboardPayload(payload)); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const visibleTrend = useMemo(() => {
    const trend = data?.vendorTrend || [];
    return trend.slice(-range);
  }, [data, range]);

  if (error) return <div className="admin-feedback error">{error}</div>;
  if (!data) return <DashboardSkeleton />;

  const kpis = data.kpis.length ? data.kpis : data.stats.map(KpiFallback);
  const trend = visibleTrend.length ? visibleTrend : [{ label: "No data", value: 0, active: 0, draft: 0 }];
  const sparkline = data.vendorTrend.slice(-12).map((item) => item.value);

  async function handleExportOverview() {
    setExportingOverview(true);
    try {
      await openOverviewPdf({
        kpis,
        statusBreakdown: data.statusBreakdown,
        categoryBreakdown: data.categoryBreakdown,
        sourceBreakdown: data.sourceBreakdown,
        aiPipeline: data.aiPipeline,
      });
    } finally {
      setExportingOverview(false);
    }
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-heading">
        <div>
          <div className="admin-eyebrow">Operations overview</div>
          <h2>Good morning, Admin</h2>
          <p>Monitor vendor quality, content processing, and moderation from one place.</p>
        </div>
        <div className="admin-dashboard-actions">
          <span className="admin-last-updated">Updated {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now"}</span>
          <button type="button" className="admin-secondary-btn compact" onClick={handleExportOverview} disabled={exportingOverview}>
            <FileDown size={14} /> {exportingOverview ? "Preparing PDF…" : "Export PDF"}
          </button>
          <Link className="admin-secondary-btn compact" to="/admin/reviews"><MessageSquareWarning size={14} /> Review queue</Link>
          <Link className="admin-primary-btn compact" to="/admin/vendors2"><Store size={14} /> Add vendor</Link>
        </div>
      </div>

      <section className="admin-kpi-grid">
        {kpis.map((item) => {
          const Icon = KPI_ICONS[item.key] || BarChart3;
          return <KpiCard key={item.key || item.label} item={item} icon={Icon} sparkline={sparkline} />;
        })}
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-chart-panel admin-span-8">
          <div className="admin-panel-header">
            <div><h2>Vendor growth</h2><p>New records created during the selected period</p></div>
            <div className="admin-range-control" role="group" aria-label="Vendor growth range">
              {rangeOptions.map((option) => <button key={option} type="button" className={range === option ? "active" : ""} onClick={() => setRange(option)}>{option}d</button>)}
            </div>
          </div>
          <LineChart data={trend} rangeLabel={`Last ${range} days`} />
        </article>

        <AttentionQueue items={data.attentionItems} />

        <article className="admin-panel admin-chart-panel admin-span-5">
          <div className="admin-panel-header"><div><h2>AI content pipeline</h2><p>Persisted content outcomes</p></div><BrainCircuit size={17} className="admin-panel-heading-icon" /></div>
          <PipelineChart data={data.aiPipeline} />
        </article>

        <article className="admin-panel admin-chart-panel admin-span-4">
          <div className="admin-panel-header"><div><h2>Vendor categories</h2><p>Current database mix</p></div><Store size={17} className="admin-panel-heading-icon" /></div>
          <BarChart data={data.categoryBreakdown} />
        </article>

        <article className="admin-panel admin-chart-panel admin-span-3">
          <div className="admin-panel-header"><div><h2>Source mix</h2><p>AI-imported records</p></div><BarChart3 size={17} className="admin-panel-heading-icon" /></div>
          <BarChart data={data.sourceBreakdown} tone="teal" />
        </article>

        <ActivityPanel vendors={data.recentVendors} processing={data.recentProcessing} />
      </section>
    </div>
  );
}
