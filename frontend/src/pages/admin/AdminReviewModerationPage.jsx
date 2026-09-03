import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Search, Star } from "lucide-react";
import { getAdminReviews, setReviewVisibility } from "../../api/admin";
import { getSelectionSummary, togglePageSelection, toggleSelection } from "../../lib/batchSelection";

const VISIBILITY_OPTIONS = ["all", "visible", "hidden"];

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, isError, onDone }) {
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
        background: isError ? "var(--admin-danger-text)" : "var(--admin-success-text)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
        animation: "fadeInUp 0.22s ease",
      }}
    >
      {isError ? message : `✓ ${message}`}
    </div>
  );
}

function Pagination({ pagination, onPageChange }) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;
  return (
    <div className="admin-pagination">
      <div className="admin-pagination-meta"><strong>{total}</strong> reviews</div>
      <div className="admin-pagination-controls">
        <button type="button" className="admin-secondary-btn compact" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span>Page {page} / {totalPages}</span>
        <button type="button" className="admin-secondary-btn compact" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export default function AdminReviewModerationPage() {
  const [draftQuery, setDraftQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [toast, setToast] = useState(null); // { message, isError }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmBulkAction, setConfirmBulkAction] = useState(null); // { isHidden, count }
  const [confirmToggle, setConfirmToggle] = useState(null); // single review pending hide/unhide
  const [bulkAction, setBulkAction] = useState(null);
  const selectAllRef = useRef(null);

  const PAGE_SIZE = 10;

  const load = (page = data.pagination.page) => {
    setLoading(true);
    setError("");
    return getAdminReviews({ page, pageSize: PAGE_SIZE, visibility })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelectedIds(new Set());
    getAdminReviews({ page: 1, pageSize: PAGE_SIZE, visibility })
      .then((payload) => { if (active) setData(payload); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visibility]);

  const query = draftQuery.trim().toLowerCase();
  useEffect(() => {
    setSelectedIds(new Set());
  }, [query]);

  const filtered = query
    ? data.items.filter((r) => r.vendorName?.toLowerCase().includes(query) || r.authorName?.toLowerCase().includes(query) || r.body?.toLowerCase().includes(query))
    : data.items;
  const pageIds = useMemo(() => filtered.map((review) => String(review.id)), [filtered]);
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
    load(page);
  };

  const handleConfirmToggle = async () => {
    if (!confirmToggle) return;
    const review = confirmToggle;
    setConfirmToggle(null);
    await handleToggle(review);
  };

  const handleToggle = async (review) => {
    setUpdatingId(review.id);
    try {
      await setReviewVisibility(review.id, !review.isHidden);
      await load();
      setToast({ message: review.isHidden ? "Review restored successfully." : "Review hidden successfully." });
    } catch (err) {
      setError(err.message);
      setToast({ message: err.message, isError: true });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBulkVisibility = async () => {
    if (!confirmBulkAction) return;
    const { isHidden } = confirmBulkAction;
    const ids = [...selectedIds];
    setConfirmBulkAction(null);
    setBulkAction(isHidden ? "hide" : "restore");
    setError("");

    const results = await Promise.allSettled(ids.map((id) => setReviewVisibility(id, isHidden)));
    const failed = results.filter((result) => result.status === "rejected").length;
    const completed = ids.length - failed;

    setSelectedIds(new Set());
    await load();
    setBulkAction(null);

    if (failed) {
      setToast({ message: `${completed} updated, ${failed} failed.`, isError: true });
    } else {
      setToast({ message: `${completed} review${completed === 1 ? "" : "s"} ${isHidden ? "hidden" : "restored"}.` });
    }
  };

  return (
    <section className="admin-vendors-page flex flex-col gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex h-10 w-full min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 shadow-sm focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300 max-lg:h-11 xl:max-w-2xl">
          <Search size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
          <input type="search" aria-label="Search reviews" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" value={draftQuery} onChange={(e) => setDraftQuery(e.target.value)} placeholder="Search reviews, vendors, authors…" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select aria-label="Review visibility" className="h-10 appearance-none rounded-full border border-gray-200 bg-white pl-4 pr-10 text-sm font-semibold text-blue-600 shadow-sm outline-none hover:bg-gray-50 focus:border-gray-300 focus:ring-1 focus:ring-gray-300" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              {VISIBILITY_OPTIONS.map((v) => (
                <option key={v} value={v}>{v === "all" ? "All Reviews" : v[0].toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="admin-feedback error">{error}</div> : null}

      <section className="admin-panel admin-table-panel">
        {selection.selectedCount > 0 && (
          <div className="admin-batch-toolbar" role="region" aria-label="Review batch actions">
            <div className="admin-batch-summary">
              <span className="admin-batch-check"><Eye size={14} /></span>
              <strong>{selection.selectedCount} selected</strong>
              <span>on this page</span>
            </div>
            <div className="admin-batch-actions">
              <button
                className="admin-secondary-btn compact"
                type="button"
                disabled={Boolean(bulkAction)}
                onClick={() => setConfirmBulkAction({ isHidden: true, count: selection.selectedCount })}
              >
                <EyeOff size={14} />
                Hide selected
              </button>
              <button
                className="admin-secondary-btn compact"
                type="button"
                disabled={Boolean(bulkAction)}
                onClick={() => setConfirmBulkAction({ isHidden: false, count: selection.selectedCount })}
              >
                <Eye size={14} />
                Restore selected
              </button>
              <button className="admin-batch-clear" type="button" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          </div>
        )}
        <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-selection-column">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={selection.allOnPageSelected}
                  onChange={(event) => handlePageSelection(event.target.checked)}
                  disabled={!pageIds.length || loading || Boolean(bulkAction)}
                  aria-label="Select all reviews on this page"
                />
              </th>
              <th>Vendor</th>
              <th>Author</th>
              <th>Rating</th>
              <th>Review</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7"><div className="admin-feedback">Loading reviews…</div></td></tr>
            ) : filtered.length ? (
              filtered.map((r) => (
                <tr key={r.id} className="cursor-default">
                  <td className="admin-selection-column">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(r.id))}
                      onChange={(event) => handleItemSelection(r.id, event.target.checked)}
                      disabled={Boolean(bulkAction)}
                      aria-label={`Select review by ${r.authorName || "Anonymous"}`}
                    />
                  </td>
                  <td><strong>{r.vendorName || "—"}</strong></td>
                  <td>{r.authorName || "Anonymous"}</td>
                  <td>
                    <span className="admin-table-score">
                      <Star size={13} fill="currentColor" />
                      <span>{r.rating}</span>
                    </span>
                  </td>
                  <td>
                    <div className="admin-table-clamp clamp-2">{r.body || <span className="admin-dash">—</span>}</div>
                  </td>
                  <td>
                    <span className={`admin-status-pill ${r.isHidden ? "suspended" : "active"}`}>
                      {r.isHidden ? `Hidden${r.hiddenReason ? ` · ${r.hiddenReason}` : ""}` : "Visible"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-table-actions">
                      <button
                        type="button"
                        onClick={() => setConfirmToggle(r)}
                        disabled={updatingId === r.id}
                        aria-label={r.isHidden ? "Unhide review" : "Hide review"}
                      >
                        {r.isHidden ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="7"><div className="admin-empty-state">No reviews matched this filter.</div></td></tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination pagination={data.pagination} onPageChange={handlePageChange} />
      </section>

      {confirmBulkAction && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setConfirmBulkAction(null)}>
          <div className="admin-modal-card admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-review-title" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 id="bulk-review-title">{confirmBulkAction.isHidden ? "Hide selected reviews?" : "Restore selected reviews?"}</h2>
                <p>{confirmBulkAction.count} review{confirmBulkAction.count === 1 ? "" : "s"} will be updated.</p>
              </div>
              <button type="button" className="admin-icon-btn subtle" onClick={() => setConfirmBulkAction(null)} aria-label="Close confirmation">×</button>
            </div>
            <div className="admin-modal-form">
              <p className="admin-confirm-message">
                {confirmBulkAction.isHidden
                  ? "Hidden reviews will no longer appear in the public vendor experience. You can restore them later."
                  : "Restored reviews will be visible to users again."}
              </p>
              <div className="admin-modal-actions">
                <button type="button" className="admin-secondary-btn compact" onClick={() => setConfirmBulkAction(null)}>Cancel</button>
                <button type="button" className={`admin-primary-btn compact${confirmBulkAction.isHidden ? " danger" : ""}`} onClick={handleBulkVisibility}>
                  {confirmBulkAction.isHidden ? "Hide reviews" : "Restore reviews"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmToggle && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setConfirmToggle(null)}>
          <div className="admin-modal-card admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="toggle-review-title" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2 id="toggle-review-title">{confirmToggle.isHidden ? "Unhide this review?" : "Hide this review?"}</h2>
                <p>Review by {confirmToggle.authorName || "Anonymous"}{confirmToggle.vendorName ? ` on ${confirmToggle.vendorName}` : ""}.</p>
              </div>
              <button type="button" className="admin-icon-btn subtle" onClick={() => setConfirmToggle(null)} aria-label="Close confirmation">×</button>
            </div>
            <div className="admin-modal-form">
              <p className="admin-confirm-message">
                {confirmToggle.isHidden
                  ? "This review will be visible to users again."
                  : "This review will no longer appear in the public vendor experience. You can restore it later."}
              </p>
              <div className="admin-modal-actions">
                <button type="button" className="admin-secondary-btn compact" onClick={() => setConfirmToggle(null)}>Cancel</button>
                <button type="button" className={`admin-primary-btn compact${confirmToggle.isHidden ? "" : " danger"}`} onClick={handleConfirmToggle}>
                  {confirmToggle.isHidden ? "Unhide review" : "Hide review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} isError={toast.isError} onDone={() => setToast(null)} />}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
