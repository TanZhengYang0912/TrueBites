import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

function safeMax(values) {
  return Math.max(1, ...values.map((value) => Number(value) || 0));
}

export function LineChart({ data = [], rangeLabel = "Last 30 days" }) {
  const max = safeMax(data.flatMap((item) => [item.value, item.active, item.draft]));
  const width = 720;
  const height = 230;
  const chartTop = 20;
  const chartBottom = 190;
  const chartHeight = chartBottom - chartTop;

  const getPoints = (key) => data.map((item, index) => {
    const x = data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = chartBottom - ((Number(item[key]) || 0) / max) * chartHeight;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="admin-chart-shell">
      <div className="admin-chart-meta">
        <span>{rangeLabel}</span>
        <span className="admin-chart-legend"><i className="blue" /> New vendors <i className="teal" /> Active <i className="amber" /> Draft</span>
      </div>
      <svg className="admin-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Vendor growth for ${rangeLabel}`}>
        {[0, 1, 2, 3].map((step) => {
          const y = chartTop + (chartHeight / 3) * step;
          return <line key={step} x1="0" y1={y} x2={width} y2={y} className="admin-chart-gridline" />;
        })}
        <polyline points={getPoints("value")} className="admin-chart-line blue-line" />
        <polyline points={getPoints("active")} className="admin-chart-line teal-line" />
        <polyline points={getPoints("draft")} className="admin-chart-line amber-line" />
      </svg>
      <div className="admin-chart-axis">
        <span>{data[0]?.label || "—"}</span>
        <span>{data[Math.floor(data.length / 2)]?.label || "—"}</span>
        <span>{data[data.length - 1]?.label || "—"}</span>
      </div>
    </div>
  );
}

export function BarChart({ data = [], tone = "blue" }) {
  const max = safeMax(data.map((item) => item.value));
  if (!data.length) return <div className="admin-chart-empty">No data available for this period.</div>;

  return (
    <div className="admin-bar-chart" role="list">
      {data.map((item) => (
        <div className="admin-bar-row" key={item.label} role="listitem">
          <div className="admin-bar-label"><span>{item.label}</span><strong>{item.value}</strong></div>
          <div className="admin-bar-track"><span className={`admin-bar-fill ${item.tone || tone}`} style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function PipelineChart({ data = [] }) {
  const max = safeMax(data.map((item) => item.value));
  if (!data.length) return <div className="admin-chart-empty">Pipeline data is not available yet.</div>;

  return (
    <div className="admin-pipeline-chart" role="list">
      {data.map((item) => (
        <div className="admin-pipeline-chart-row" key={item.label} role="listitem">
          <div className="admin-pipeline-chart-label"><span>{item.label}</span><strong>{item.value}</strong></div>
          <div className="admin-bar-track"><span className={`admin-bar-fill ${item.tone || "blue"}`} style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function KpiCard({ item, icon: Icon }) {
  return (
    <article className="admin-kpi-card">
      <div className={`admin-kpi-icon ${item.tone || "neutral"}`}><Icon size={17} /></div>
      <div className="admin-kpi-label">{item.label}</div>
      <div className="admin-kpi-value">{item.value}{item.suffix || ""}</div>
      <div className="admin-kpi-footer">
        <span>{item.note}</span>
      </div>
    </article>
  );
}

export function Delta({ value }) {
  if (!value || value.tone === "neutral") return <span className="admin-delta neutral"><Minus size={13} /> {value?.label || "—"}</span>;
  const Icon = value.tone === "positive" ? ArrowUpRight : ArrowDownRight;
  return <span className={`admin-delta ${value.tone}`}><Icon size={13} /> {value.label}</span>;
}
