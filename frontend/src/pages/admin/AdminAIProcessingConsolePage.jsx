import { Check, Database, Download, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAdminAiRecords } from "../../api/admin";
import { getSelectionSummary, togglePageSelection, toggleSelection } from "../../lib/batchSelection";
import { getAiApiBase } from "../../lib/aiApi";

// ── AI module step components (reuse from /ai page) ──────────────────────────
import StepIndicator     from "../../components/ai/StepIndicator";
import URLSubmissionStep from "../../components/ai/URLSubmissionStep";
import TranscriptStep    from "../../components/ai/TranscriptStep";
import SummaryStep       from "../../components/ai/SummaryStep";
import ExtractionStep    from "../../components/ai/ExtractionStep";
import BatchProgressStep from "../../components/ai/BatchProgressStep";
import BatchResultsStep  from "../../components/ai/BatchResultsStep";

// Import the ai-module styles (needed for step components)

const AI_BASE  = getAiApiBase(import.meta.env.VITE_AI_API_BASE);
const POLL_MS  = 2000;

const PAGE_TO_STEP = {
  submit:         1,
  processing:     2,
  summary:        3,
  extraction:     4,
  batch_progress: 2,
  batch_results:  4,
};

function exportCsv(items) {
  const header = ["Title", "Vendor", "Platform", "Location", "Dishes", "Recommendation", "Score", "Status", "Video URL"];
  const rows = items.map((item) => [
    item.title, item.vendor, item.platform, item.location,
    item.dishes.join(" | "), item.recommendation,
    item.score ?? "", item.status, item.sourceVideoUrl || "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "truebites-ai-records.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── AI Workflow embedded panel ────────────────────────────────────────────────
function AIWorkflowPanel() {
  const [page,      setPage]     = useState("submit");
  const [jobId,     setJobId]    = useState(null);
  const [jobData,   setJobData]  = useState({});
  const [reviewSummary, setReviewSummary] = useState('');
  const [batchId,   setBatchId]  = useState(null);
  const [batchData, setBatchData] = useState({});
  const pollerRef      = useRef(null);
  const batchPollerRef = useRef(null);

  useEffect(() => {
    if (!jobId || page === "submit") return;
    pollerRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${AI_BASE}/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJobData(data);
        if (data.summary) setReviewSummary((current) => current || data.summary);
        if (data.status === "completed" || data.status === "error")
          clearInterval(pollerRef.current);
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(pollerRef.current);
  }, [jobId, page]);

  useEffect(() => {
    if (!batchId || page === "submit") return;
    batchPollerRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${AI_BASE}/batch-status/${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        setBatchData(data);
        if (data.in_progress === 0) clearInterval(batchPollerRef.current);
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(batchPollerRef.current);
  }, [batchId, page]);

  const handleJobStarted = (newJobId, url, platform) => {
    setJobId(newJobId);
    setReviewSummary('');
    setJobData({ status: "queued", progress: 0, step: 0, step_label: "Starting…", url, platform });
    setPage("processing");
  };

  const handleBatchStarted = (newBatchId, total) => {
    setBatchId(newBatchId);
    setBatchData({ total, in_progress: total, completed: 0, failed: 0, jobs: [] });
    setPage("batch_progress");
  };

  const handleReset = () => {
    clearInterval(pollerRef.current);
    clearInterval(batchPollerRef.current);
    setJobId(null);   setJobData({}); setReviewSummary('');
    setBatchId(null); setBatchData({});
    setPage("submit");
  };

  const handleRetry = async () => {
    if (!jobId) return;
    try {
      const response = await fetch(`${AI_BASE}/retry/${jobId}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Unable to retry processing');
      setJobData((current) => ({ ...current, ...result, status: 'queued', progress: 0, step: 0, step_label: 'Queued for retry', error: null }));
      setReviewSummary('');
      setPage('processing');
    } catch (error) {
      setJobData((current) => ({ ...current, status: 'error', error: error.message }));
    }
  };

  const handleCreateDraft = async ({ summary, extracted, duplicate_acknowledged }) => {
    if (!jobId) throw new Error('No processing job is selected');
    const response = await fetch(`${AI_BASE}/create-draft/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, extracted, duplicate_acknowledged }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Unable to create draft vendor');
    setJobData((current) => ({ ...current, ...result }));
    return result;
  };

  const completedSteps = [];
  if (page === "processing" && jobData.status === "completed") completedSteps.push(1, 2);
  if (page === "summary")    completedSteps.push(1, 2);
  if (page === "extraction") completedSteps.push(1, 2, 3);
  if (page === "batch_progress" && batchData.in_progress === 0) completedSteps.push(1, 2, 3);
  if (page === "batch_results") completedSteps.push(1, 2, 3, 4);

  const currentStep = PAGE_TO_STEP[page] || 1;

  return (
    <div className="admin-ai-module-inner">
      <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />

      {page === "submit" && (
        <URLSubmissionStep onJobStarted={handleJobStarted} onBatchStarted={handleBatchStarted} />
      )}
      {page === "processing" && (
        <TranscriptStep jobData={jobData} onTranscriptReady={() => setPage("summary")} onRetry={handleRetry} />
      )}
      {page === "summary" && (
        <SummaryStep
          jobData={jobData}
          summaryValue={reviewSummary}
          onSummaryChange={setReviewSummary}
          onNext={() => setPage("extraction")}
          onBack={() => setPage("processing")}
        />
      )}
      {page === "extraction" && (
        <ExtractionStep
          jobData={jobData}
          reviewSummary={reviewSummary || jobData.summary || ''}
          onBack={() => setPage("summary")}
          onReset={handleReset}
          onCreateDraft={handleCreateDraft}
        />
      )}
      {page === "batch_progress" && (
        <BatchProgressStep batchData={batchData} onResultsReady={() => setPage("batch_results")} />
      )}
      {page === "batch_results" && (
        <BatchResultsStep batchData={batchData} onReset={handleReset} />
      )}
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function DetailModal({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{item.title}</h2>
            <p>{item.vendor} · {item.platform}</p>
          </div>
          <button type="button" className="admin-icon-btn subtle" onClick={onClose}>×</button>
        </div>
        <div className="admin-detail-grid">
          <div className="admin-detail-row">
            <strong>Location</strong>
            <span>{item.location}</span>
          </div>
          <div className="admin-detail-row">
            <strong>Status</strong>
            <span className={`admin-status-pill ${item.status.toLowerCase()}`}>{item.status}</span>
          </div>
          <div className="admin-detail-row">
            <strong>Recommendation</strong>
            <span className={`admin-recommendation ${item.recommendation === "Highly Recommended" ? "high" : ""}`}>
              {item.recommendation}
            </span>
          </div>
          <div className="admin-detail-row stack">
            <strong>Summary</strong>
            <span>{item.summary || "No AI summary stored for this record yet."}</span>
          </div>
          <div className="admin-detail-row stack">
            <strong>Dishes</strong>
            <div className="admin-chip-wrap">
              {item.dishes.map((d) => <span key={d} className="admin-chip">{d}</span>)}
            </div>
          </div>
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onClose}>Close</button>
            {item.sourceVideoUrl && (
              <a className="admin-primary-btn compact" href={item.sourceVideoUrl} target="_blank" rel="noreferrer">
                Open Source Video
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminAIProcessingConsolePage() {
  const [data, setData]       = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectAllRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getAdminAiRecords({ page: data.pagination.page, pageSize: 8 })
      .then((payload) => { if (active) setData(payload); })
      .catch((err)    => { if (active) setError(err.message); })
      .finally(()     => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [data.pagination.page]);

  const totalProcessed = useMemo(() => data.pagination.total || data.items.length, [data]);
  const pageIds = useMemo(() => data.items.map((item) => String(item.id)), [data.items]);
  const selection = useMemo(() => getSelectionSummary(selectedIds, pageIds), [selectedIds, pageIds]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selection.someOnPageSelected;
  }, [selection.someOnPageSelected]);

  const handlePageSelection = (checked) => {
    setSelectedIds((current) => togglePageSelection(current, pageIds, checked));
  };

  const handleItemSelection = (id, checked) => {
    setSelectedIds((current) => toggleSelection(current, String(id), checked));
  };

  const handlePageChange = (page) => {
    setSelectedIds(new Set());
    setData((current) => ({ ...current, pagination: { ...current.pagination, page } }));
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* ── Hero banner ── */}
      <section className="admin-hero-banner">
        <div className="admin-hero-icon">
          <Database size={22} />
        </div>
        <div className="admin-hero-copy">
          <div className="admin-hero-label">AI content queue</div>
          <h2>Food Influencer Content Analyzer</h2>
        </div>
        <div className="admin-model-strip">
          <div><strong>small</strong><span>Whisper</span></div>
          <div><strong>llama 3.1</strong><span>Groq</span></div>
          <div><strong>Live</strong><span>Supabase</span></div>
        </div>
      </section>

      {/* ── AI Workflow (embedded full module) ── */}
      <section className="admin-panel" style={{ padding: "20px" }}>
        <AIWorkflowPanel />
      </section>

      {/* ── Batch Results (live DB) ── */}
      <section className="admin-panel admin-ai-results">
        <div className="admin-panel-header stack">
          <div>
            <h2>Batch Results</h2>
            <p>{totalProcessed} videos processed</p>
          </div>
          <div className="admin-panel-actions">
            <button
              className="admin-secondary-btn compact"
              type="button"
              onClick={() => exportCsv(data.items)}
              disabled={!data.items.length}
            >
              <Download size={14} />
              <span>CSV</span>
            </button>
            <button className="admin-secondary-btn compact" type="button" disabled>
              <Database size={14} />
              <span>Live from DB</span>
            </button>
          </div>
        </div>

        {selection.selectedCount > 0 && (
          <div className="admin-batch-toolbar" role="region" aria-label="AI content batch actions">
            <div className="admin-batch-summary">
              <span className="admin-batch-check"><Check size={14} /></span>
              <strong>{selection.selectedCount} selected</strong>
              <span>on this page</span>
            </div>
            <div className="admin-batch-actions">
              <button
                className="admin-secondary-btn compact"
                type="button"
                onClick={() => exportCsv(data.items.filter((item) => selectedIds.has(String(item.id))))}
              >
                <Download size={14} />
                Export selected
              </button>
              <button className="admin-batch-clear" type="button" onClick={() => setSelectedIds(new Set())}>
                <X size={14} />
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="admin-table-scroll">
        <table className="admin-table admin-results-table">
          <thead>
            <tr>
              <th className="admin-selection-column">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={selection.allOnPageSelected}
                  onChange={(event) => handlePageSelection(event.target.checked)}
                  disabled={!pageIds.length || loading}
                  aria-label="Select all AI records on this page"
                />
              </th>
              <th>Video Title</th>
              <th>Vendor</th>
              <th>Location</th>
              <th>Dishes</th>
              <th>Recommendation</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7"><div className="admin-feedback">Loading AI records…</div></td></tr>
            ) : data.items.length ? (
              data.items.map((item) => (
                <tr key={item.id}>
                  <td className="admin-selection-column">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(item.id))}
                      onChange={(event) => handleItemSelection(item.id, event.target.checked)}
                      aria-label={`Select ${item.vendor || item.title}`}
                    />
                  </td>
                  <td className="admin-result-title">
                    <div className="admin-table-clamp clamp-3">{item.title}</div>
                  </td>
                  <td><div className="admin-table-clamp clamp-2">{item.vendor}</div></td>
                  <td><div className="admin-table-clamp clamp-2">{item.location}</div></td>
                  <td>
                    <div className="admin-chip-wrap">
                      {item.dishes.slice(0, 3).map((d) => (
                        <span key={d} className="admin-chip">{d}</span>
                      ))}
                      {item.dishes.length > 3 && (
                        <span className="admin-chip muted">+{item.dishes.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className={`admin-recommendation ${item.recommendation === "Highly Recommended" ? "high" : ""}`}>
                    {item.recommendation}
                  </td>
                  <td>
                    <button type="button" className="admin-detail-btn" onClick={() => setDetailItem(item)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="7"><div className="admin-empty-state">No processed AI records saved yet.</div></td></tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="admin-pagination">
          <div className="admin-pagination-meta">
            <strong>{data.pagination.total}</strong> processed records
          </div>
          <div className="admin-pagination-controls">
            <button
              type="button"
              className="admin-secondary-btn compact"
              disabled={data.pagination.page <= 1}
              onClick={() => handlePageChange(data.pagination.page - 1)}
            >
              Previous
            </button>
            <span>Page {data.pagination.page} / {data.pagination.totalPages}</span>
            <button
              type="button"
              className="admin-secondary-btn compact"
              disabled={data.pagination.page >= data.pagination.totalPages}
              onClick={() => handlePageChange(data.pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}
