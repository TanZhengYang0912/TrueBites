import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { DASHBOARD_COPY, TREND_SERIES, barTone, chartMaximum, chartPoints } from "../../lib/dashboardReport";

function trendToneClass(tone) {
  return barTone(tone) === "warning" ? "amber" : barTone(tone);
}

export function LineChart({ data = [], rangeLabel = "Last 30 days", emptyLabel = DASHBOARD_COPY.growth.empty }) {
  const width = 720;
  const height = 230;
  const chartTop = 20;
  const chartBottom = 190;
  const chartHeight = chartBottom - chartTop;
  if (!data.length) return <div className="admin-chart-empty">{emptyLabel}</div>;

  const max = chartMaximum(data, TREND_SERIES.map((series) => series.key));

  const getPoints = (key) => chartPoints(data, key, {
    width,
    top: chartTop,
    bottom: chartBottom,
    max,
  }).map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div className="admin-chart-shell">
      <div className="admin-chart-meta">
        <span>{rangeLabel}</span>
        <span className="admin-chart-legend">
          {TREND_SERIES.map((series) => (
            <span key={series.key}>
              <i className={trendToneClass(series.tone)} /> {series.label}
            </span>
          ))}
        </span>
      </div>
      <svg className="admin-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Vendor growth for ${rangeLabel}`}>
        {[0, 1, 2, 3].map((step) => {
          const y = chartTop + (chartHeight / 3) * step;
          return <line key={step} x1="0" y1={y} x2={width} y2={y} className="admin-chart-gridline" />;
        })}
        {TREND_SERIES.map((series) => (
          <polyline
            key={series.key}
            points={getPoints(series.key)}
            className={`admin-chart-line ${trendToneClass(series.tone)}-line`}
          />
        ))}
      </svg>
      <div className="admin-chart-axis">
        <span>{data[0]?.label || "—"}</span>
        <span>{data[Math.floor(data.length / 2)]?.label || "—"}</span>
        <span>{data[data.length - 1]?.label || "—"}</span>
      </div>
    </div>
  );
}

export function BarChart({ data = [], tone = "blue", emptyLabel = DASHBOARD_COPY.categories.empty }) {
  const max = chartMaximum(data);
  if (!data.length) return <div className="admin-chart-empty">{emptyLabel}</div>;

  return (
    <div className="admin-bar-chart" role="list">
      {data.map((item) => (
        <div className="admin-bar-row" key={item.label} role="listitem">
          <div className="admin-bar-label"><span>{item.label}</span><strong>{item.value}</strong></div>
          <div className="admin-bar-track"><span className={`admin-bar-fill ${barTone(item.tone, tone)}`} style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function PipelineChart({ data = [], emptyLabel = DASHBOARD_COPY.pipeline.empty }) {
  const max = chartMaximum(data);
  if (!data.length) return <div className="admin-chart-empty">{emptyLabel}</div>;

  return (
    <div className="admin-pipeline-chart" role="list">
      {data.map((item) => (
        <div className="admin-pipeline-chart-row" key={item.label} role="listitem">
          <div className="admin-pipeline-chart-label"><span>{item.label}</span><strong>{item.value}</strong></div>
          <div className="admin-bar-track"><span className={`admin-bar-fill ${barTone(item.tone)}`} style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }} /></div>
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
