import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Search, XCircle, RotateCcw, Ticket } from "lucide-react";
import { getAdminUsers, suspendAdminUser, getAppealDetail, decideAppeal } from "../../api/admin";

const SUSPEND_OPTIONS = [
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "1y", label: "1 year" },
  { value: "indefinite", label: "Until disabled" },
];

function UserAvatar({ user }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = (user.displayName || user.email || "?").trim();

  useEffect(() => {
    setImageFailed(false);
  }, [user.avatarUrl]);

  if (user.avatarUrl && !imageFailed) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        onError={() => setImageFailed(true)}
        style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }

  return (
    <div
      className="avatar-fallback"
      aria-label={`${label} avatar`}
      style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--admin-panel-soft)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}
    >
      {label[0]?.toUpperCase() || "?"}
    </div>
  );
}

function Pagination({ pagination, onPageChange }) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;
  return (
    <div className="admin-pagination">
      <div className="admin-pagination-meta"><strong>{total}</strong> users</div>
      <div className="admin-pagination-controls">
        <button type="button" className="admin-secondary-btn compact" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span>Page {page} / {totalPages}</span>
        <button type="button" className="admin-secondary-btn compact" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

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
      }}
    >
      {isError ? message : `✓ ${message}`}
    </div>
  );
}

// Duration picker for suspending one account — Supabase's ban mechanism
// backs this (see PATCH /api/admin/users/:id/suspend), so it actually blocks
// sign-in, not just a cosmetic flag.
function SuspendDialog({ user, busy, onConfirm, onCancel }) {
  const [duration, setDuration] = useState("1d");
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="admin-modal-card admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="suspend-user-title" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2 id="suspend-user-title">Suspend {user.displayName || user.email}?</h2>
        </div>
        <div className="admin-modal-form">
          <p className="admin-confirm-message">
            They'll be blocked from signing back in until the suspension ends, and will see this reason the next time they use the app.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-navy)" }}>
              Reason
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this account is being suspended…"
              rows={4}
              maxLength={2000}
              style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--admin-border)", background: "var(--admin-panel-soft)", font: "inherit", fontSize: 13, resize: "vertical" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-navy)" }}>
              Duration
            </span>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--admin-border)", background: "var(--admin-panel-soft)", font: "inherit", fontSize: 13 }}
            >
              {SUSPEND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="admin-primary-btn compact danger"
              onClick={() => onConfirm(duration, trimmedReason)}
              disabled={busy || !trimmedReason}
            >
              {busy ? "…" : "Suspend user"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shows one suspended user's appeal message and lets an admin approve
// (reactivates the account, same effect as the Reactivate action) or reject
// (closes the ticket, leaves the suspension as-is).
function AppealReviewModal({ appealId, busy, onDecide, onClose }) {
  const [appeal, setAppeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getAppealDetail(appealId)
      .then((data) => { if (active) setAppeal(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appealId]);

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal-card admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="appeal-title" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2 id="appeal-title">Suspension appeal</h2>
        </div>
        <div className="admin-modal-form">
          {loading ? (
            <p className="admin-confirm-message">Loading appeal…</p>
          ) : error ? (
            <p className="admin-confirm-message" style={{ color: "var(--admin-danger-text)" }}>{error}</p>
          ) : (
            <>
              <p className="admin-confirm-message">
                From <strong>{appeal.userEmail}</strong> · {new Date(appeal.createdAt).toLocaleString()}
              </p>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--admin-border)",
                  background: "var(--admin-panel-soft)",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  marginBottom: 4,
                }}
              >
                {appeal.message}
              </div>
            </>
          )}
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onClose} disabled={busy}>Close</button>
            <button
              type="button"
              className="admin-secondary-btn compact"
              onClick={() => onDecide("reject")}
              disabled={busy || loading || Boolean(error)}
              style={{ color: "var(--admin-danger-text)" }}
            >
              {busy ? "…" : "Reject"}
            </button>
            <button
              type="button"
              className="admin-primary-btn compact"
              onClick={() => onDecide("approve")}
              disabled={busy || loading || Boolean(error)}
            >
              {busy ? "…" : "Approve & unsuspend"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Directory of customer accounts. Clicking a row opens that user's audit log
// (what they did, and when); the row action suspends/reactivates the account
// instead. Admin accounts don't appear here at all (see GET /api/admin/users).
export default function AdminUserModerationPage() {
  const navigate = useNavigate();
  const { refreshAppealBadge } = useOutletContext();
  const [draftQuery, setDraftQuery] = useState("");
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suspendTarget, setSuspendTarget] = useState(null); // user pending the duration dialog
  const [appealTarget, setAppealTarget] = useState(null); // appealId pending review
  const [workingId, setWorkingId] = useState(null);
  const [decidingAppeal, setDecidingAppeal] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const PAGE_SIZE = 15;

  const load = (page = data.pagination.page, q = draftQuery.trim()) => {
    setLoading(true);
    setError("");
    setSelectedIds([]);
    return getAdminUsers({ page, pageSize: PAGE_SIZE, q })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const q = draftQuery.trim();
    setSelectedIds([]);
    const t = setTimeout(() => {
      getAdminUsers({ page: 1, pageSize: PAGE_SIZE, q })
        .then((payload) => { if (active) setData(payload); })
        .catch((err) => { if (active) setError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftQuery]);

  const handlePageChange = (page) => load(page);

  const handleSelectAll = (event) => {
    setSelectedIds(event.target.checked ? data.items.map((user) => user.id) : []);
  };

  const handleSelectOne = (event, id) => {
    event.stopPropagation();
    setSelectedIds((current) => event.target.checked
      ? [...current, id]
      : current.filter((selectedId) => selectedId !== id));
  };

  const handleBatchSuspend = () => {
    const selectedUsers = data.items.filter((user) => selectedIds.includes(user.id) && !user.suspended);
    if (!selectedUsers.length) return;
    setSuspendTarget({
      displayName: `${selectedUsers.length} selected users`,
      email: "",
      ids: selectedUsers.map((user) => user.id),
      isBatch: true,
    });
  }

  const handleSuspendConfirm = async (duration, reason) => {
    const target = suspendTarget;
    if (!target) return;
    setSuspendTarget(null);

    if (target.isBatch) {
      setBatchBusy(true);
      try {
        const results = await Promise.allSettled(target.ids.map((id) => suspendAdminUser(id, duration, reason)));
        const failed = results.filter((result) => result.status === "rejected");
        await load();
        setToast({
          message: failed.length
            ? `${target.ids.length - failed.length} user(s) suspended; ${failed.length} failed.`
            : `${target.ids.length} user(s) suspended.`,
          isError: failed.length > 0,
        });
      } catch (err) {
        setToast({ message: err.message, isError: true });
      } finally {
        setBatchBusy(false);
      }
      return;
    }

    const user = target;
    setWorkingId(user.id);
    try {
      await suspendAdminUser(user.id, duration, reason);
      await load();
      setToast({ message: `${user.email} suspended.` });
    } catch (err) {
      setToast({ message: err.message, isError: true });
    } finally {
      setWorkingId(null);
    }
  };

  const handleReactivate = async (user) => {
    setWorkingId(user.id);
    try {
      await suspendAdminUser(user.id, "none");
      await load();
      setToast({ message: `${user.email} reactivated.` });
    } catch (err) {
      setToast({ message: err.message, isError: true });
    } finally {
      setWorkingId(null);
    }
  };

  const handleAppealDecision = async (decision) => {
    if (!appealTarget) return;
    setDecidingAppeal(true);
    try {
      await decideAppeal(appealTarget, decision);
      setAppealTarget(null);
      await load();
      refreshAppealBadge?.();
      setToast({ message: decision === "approve" ? "Appeal approved — account reactivated." : "Appeal rejected." });
    } catch (err) {
      setToast({ message: err.message, isError: true });
    } finally {
      setDecidingAppeal(false);
    }
  };

  const allSelected = data.items.length > 0 && selectedIds.length === data.items.length;

  return (
    <section className="admin-vendors-page">
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={15} />
          <input value={draftQuery} onChange={(e) => setDraftQuery(e.target.value)} placeholder="Search users by name or email…" />
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 shadow-sm">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.length} user(s) selected</span>
          <button type="button" disabled={loading || batchBusy || !data.items.some((user) => selectedIds.includes(user.id) && !user.suspended)} onClick={handleBatchSuspend} className="inline-flex min-h-9 items-center gap-2 rounded border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition-colors disabled:opacity-50 hover:bg-red-50"><XCircle size={14} /> Suspend selected</button>
        </div>
      )}

      {error ? <div className="admin-feedback error">{error}</div> : null}

      <section className="admin-panel admin-table-panel">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-12 text-center">
                  <input type="checkbox" checked={allSelected} onChange={handleSelectAll} disabled={loading} aria-label="Select all users on this page" className="size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:cursor-not-allowed" />
                </th>
                <th>User</th>
                <th>Provider</th>
                <th>Joined</th>
                <th>Last sign-in</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7"><div className="admin-feedback">Loading users…</div></td></tr>
              ) : data.items.length ? (
                data.items.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => navigate(`/admin/users/${user.id}`, { state: { email: user.email, displayName: user.displayName } })}
                  >
                    <td onClick={(e) => e.stopPropagation()} className="text-center">
                      <input type="checkbox" checked={selectedIds.includes(user.id)} onChange={(e) => handleSelectOne(e, user.id)} disabled={loading} aria-label={`Select ${user.email}`} className="size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:cursor-not-allowed" />
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <UserAvatar user={user} />
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <strong>{user.displayName || "Unnamed user"}</strong>
                            {user.pendingAppealId && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setAppealTarget(user.pendingAppealId); }}
                                aria-label={`Review ${user.email}'s suspension appeal`}
                                title="Pending suspension appeal — click to review"
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 20, height: 20, borderRadius: "50%",
                                  background: "var(--admin-danger-bg)", color: "var(--admin-danger-text)",
                                  border: "none", cursor: "pointer",
                                }}
                              >
                                <Ticket size={12} />
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{user.provider}</td>
                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</td>
                    <td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}</td>
                    <td>
                      <span className={`admin-status-pill ${user.suspended ? "suspended" : "active"}`}>
                        {user.suspended ? "Suspended" : "Active"}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="admin-table-actions">
                        {user.suspended ? (
                          <button
                            type="button"
                            onClick={() => handleReactivate(user)}
                            disabled={workingId === user.id}
                            aria-label={`Reactivate ${user.email}`}
                            title="Reactivate user"
                          >
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setSuspendTarget(user)}
                            disabled={workingId === user.id}
                            aria-label={`Suspend ${user.email}`}
                            title="Suspend user"
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7"><div className="admin-empty-state">No users matched this search.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={data.pagination} onPageChange={handlePageChange} />
      </section>

      {suspendTarget && (
        <SuspendDialog
          user={suspendTarget}
          busy={suspendTarget.isBatch ? batchBusy : workingId === suspendTarget.id}
          onConfirm={handleSuspendConfirm}
          onCancel={() => setSuspendTarget(null)}
        />
      )}

      {appealTarget && (
        <AppealReviewModal
          appealId={appealTarget}
          busy={decidingAppeal}
          onDecide={handleAppealDecision}
          onClose={() => setAppealTarget(null)}
        />
      )}

      {toast && <Toast message={toast.message} isError={toast.isError} onDone={() => setToast(null)} />}
    </section>
  );
}
