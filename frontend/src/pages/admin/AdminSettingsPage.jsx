import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, BrainCircuit, CheckCircle2, Clock3, ShieldCheck, Store, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getAdminSettings } from "../../api/admin";

// ── Inline edit modal ─────────────────────────────────────────────────────────
function EditModal({ label, value, onSave, onClose }) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>Edit Setting</h2>
            <p>{label}</p>
          </div>
          <button type="button" className="admin-icon-btn subtle" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-form">
          <label>
            <span>{label}</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          </label>
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="admin-primary-btn compact"
              onClick={() => { onSave(draft); onClose(); }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ title, rows, onEdit }) {
  return (
    <section className="admin-panel admin-settings-panel">
      <div className="admin-panel-header">
        <h2>{title}</h2>
      </div>
      <div className="admin-settings-list">
        {rows.map((row) => (
          <div key={row.label} className="admin-settings-row">
            <strong>{row.label}</strong>
            <div className="admin-settings-value">
              <span>{row.value}</span>
              <button
                className="admin-secondary-btn compact"
                type="button"
                onClick={() => onEdit(row)}
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusRow({ icon: Icon, label, value, tone = "success" }) {
  return (
    <div className="admin-settings-status-row">
      <div className="admin-settings-status-label">
        <span className={`admin-settings-status-icon ${tone}`}><Icon size={15} /></span>
        <span>{label}</span>
      </div>
      <span className="admin-settings-status-value">{value}</span>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone = "default" }) {
  return (
    <div className="admin-settings-metric-card">
      <span className={`admin-settings-metric-icon ${tone}`}><Icon size={15} /></span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 100,
        padding: "10px 18px",
        borderRadius: 999,
        background: "var(--admin-success-text)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
        animation: "fadeInUp 0.22s ease",
      }}
    >
      ✓ {message}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const navigate = useNavigate();
  const [data, setData]         = useState(null);
  const [error, setError]       = useState("");
  const [editingRow, setEditingRow] = useState(null);       // { label, value, section }
  const [toast, setToast]       = useState("");

  // Local overrides for settings (so edits persist within the session)
  const [platformOverrides, setPlatformOverrides] = useState({});
  const [aiOverrides, setAiOverrides]             = useState({});

  useEffect(() => {
    let active = true;
    getAdminSettings()
      .then((payload) => { if (active) setData(payload); })
      .catch((err)    => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  if (error) return <div className="admin-feedback error">{error}</div>;
  if (!data)  return <div className="admin-feedback">Loading settings…</div>;

  // Merge server data with local overrides
  const platformRows = data.platformSettings.map((row) => ({
    ...row,
    value: platformOverrides[row.label] ?? row.value,
  }));
  const aiRows = data.aiSettings.map((row) => ({
    ...row,
    value: aiOverrides[row.label] ?? row.value,
  }));

  const recentJobs = data.recentJobs || [];
  const completedJobs = recentJobs.filter((job) => job.status === "completed").length;
  const failedJobs = recentJobs.filter((job) => job.status === "failed").length;
  const queuedJobs = recentJobs.filter((job) => !["completed", "failed"].includes(job.status)).length;
  const getValue = (rows, label, fallback = "Not configured") => rows.find((row) => row.label === label)?.value || fallback;
  const backendApi = getValue(aiRows, "Backend API");
  const whisperModel = getValue(aiRows, "Whisper Model");
  const llmModel = getValue(aiRows, "LLM Model");
  const autoSave = getValue(aiRows, "Auto-save to Database");

  const handleEdit = (row, section) => {
    setEditingRow({ ...row, section });
  };

  const handleSave = (newValue) => {
    if (!editingRow) return;
    if (editingRow.section === "platform") {
      setPlatformOverrides((prev) => ({ ...prev, [editingRow.label]: newValue }));
    } else {
      setAiOverrides((prev) => ({ ...prev, [editingRow.label]: newValue }));
    }
    setToast(`"${editingRow.label}" updated`);
    setEditingRow(null);
  };

  return (
    <div className="admin-settings-grid">
      <div className="admin-settings-layout">
        <div className="admin-settings-main">
          <SettingsPanel
            title="Platform Settings"
            rows={platformRows}
            onEdit={(row) => handleEdit(row, "platform")}
          />
          <SettingsPanel
            title="AI Processing Settings"
            rows={aiRows}
            onEdit={(row) => handleEdit(row, "ai")}
          />
        </div>

        <aside className="admin-settings-side">
          <section className="admin-panel admin-settings-overview">
            <div className="admin-panel-header stack">
              <div>
                <h2>System Overview</h2>
                <p>Current configuration snapshot</p>
              </div>
              <span className="admin-settings-live-label"><span /> Live</span>
            </div>
            <div className="admin-settings-status-list">
              <StatusRow icon={Activity} label="Backend API" value={backendApi} />
              <StatusRow icon={BrainCircuit} label="AI models" value={`${whisperModel} + ${llmModel}`} />
              <StatusRow
                icon={ShieldCheck}
                label="Review gate"
                value={autoSave.includes("manual") ? "Manual review enabled" : autoSave}
              />
            </div>
          </section>

          <section className="admin-panel admin-settings-overview">
            <div className="admin-panel-header stack">
              <div>
                <h2>Processing Overview</h2>
                <p>From the latest processing jobs</p>
              </div>
            </div>
            <div className="admin-settings-metric-grid">
              <MetricCard icon={CheckCircle2} label="Completed" value={completedJobs} tone="success" />
              <MetricCard icon={XCircle} label="Failed" value={failedJobs} tone="danger" />
              <MetricCard icon={Clock3} label="In queue" value={queuedJobs} tone="warning" />
            </div>
          </section>

          <section className="admin-panel admin-settings-overview">
            <div className="admin-panel-header stack">
              <div>
                <h2>Quick Actions</h2>
                <p>Jump to common admin tasks</p>
              </div>
            </div>
            <div className="admin-settings-quick-actions">
              <button type="button" onClick={() => navigate("/admin/ai")}>
                <span><BrainCircuit size={15} /> AI Content Queue</span><ArrowUpRight size={14} />
              </button>
              <button type="button" onClick={() => navigate("/admin/vendors2")}>
                <span><Store size={15} /> Manage Vendors</span><ArrowUpRight size={14} />
              </button>
              <button type="button" onClick={() => navigate("/admin/reviews")}>
                <span><ShieldCheck size={15} /> Review Moderation</span><ArrowUpRight size={14} />
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Recent Jobs panel */}
      <section className="admin-panel admin-settings-panel admin-settings-jobs">
        <div className="admin-panel-header">
          <div>
            <h2>Recent Jobs</h2>
            <p>{recentJobs.length ? `${recentJobs.length} latest processing jobs` : "No processing activity yet"}</p>
          </div>
          {recentJobs.length > 0 && <span className="admin-settings-jobs-summary">{completedJobs} completed · {failedJobs} failed</span>}
        </div>
        <div className="admin-settings-list">
          {recentJobs.length ? (
            recentJobs.map((job) => (
              <div key={job.id} className="admin-settings-row">
                <strong>{job.platform || "Unknown platform"}</strong>
                <div className="admin-settings-value">
                  <span
                    className={`admin-status-pill ${
                      job.status === "completed" ? "active" :
                      job.status === "failed"    ? "suspended" : "draft"
                    }`}
                  >
                    {job.status || "queued"}
                  </span>
                  <span className="admin-settings-hint">
                    {job.createdAt ? new Date(job.createdAt).toLocaleString() : "No timestamp"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="admin-empty-state">No recent AI job files found yet.</div>
          )}
        </div>
      </section>

      {editingRow && (
        <EditModal
          label={editingRow.label}
          value={editingRow.value}
          onSave={handleSave}
          onClose={() => setEditingRow(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast("")} />}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
