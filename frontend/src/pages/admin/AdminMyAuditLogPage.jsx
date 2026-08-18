import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { getMyActivity } from "../../api/admin";
import { useSession } from "../../lib/SessionContext";
import { fetchAllPages, openActivityLogPdf } from "../../lib/exportPdf";

const PAGE_SIZE = 25;

function formatAction(action) {
  return String(action || "").replace(/[._]/g, " ");
}

function Pagination({ pagination, onPageChange }) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;
  return (
    <div className="admin-pagination">
      <div className="admin-pagination-meta"><strong>{total}</strong> entries</div>
      <div className="admin-pagination-controls">
        <button type="button" className="admin-secondary-btn compact" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span>Page {page} / {totalPages}</span>
        <button type="button" className="admin-secondary-btn compact" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

// Read-only — every action the signed-in admin has personally taken (vendor
// edits, review moderation, user suspensions, appeal decisions, ...). Same
// audit_log data and table shape as a customer's activity log on the User
// Moderation panel, just scoped to "me" instead of a specific account.
export default function AdminMyAuditLogPage() {
  const { session } = useSession();
  const adminEmail = session?.user?.email || "";
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = (page = 1) => {
    setLoading(true);
    setError("");
    return getMyActivity({ page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const items = data.items || [];

  async function handleExport() {
    setExporting(true);
    try {
      const entries = await fetchAllPages((pageOpts) => getMyActivity(pageOpts));
      await openActivityLogPdf({
        title: "My Audit Log",
        subtitle: adminEmail || undefined,
        entries,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="admin-vendors-page">
      <div className="admin-panel-header">
        <div>
          <h2>My Audit Log</h2>
          <p>Everything you've personally done in the admin console</p>
        </div>
        <button
          type="button"
          className="admin-secondary-btn compact"
          onClick={handleExport}
          disabled={exporting || loading}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <FileDown size={13} />
          {exporting ? "Preparing PDF…" : "Export PDF"}
        </button>
      </div>

      {error ? <div className="admin-feedback error">{error}</div> : null}

      <section className="admin-panel admin-table-panel">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="3"><div className="admin-feedback">Loading your activity…</div></td></tr>
              ) : items.length ? (
                items.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td style={{ textTransform: "capitalize" }}>{formatAction(entry.action)}</td>
                    <td>
                      {entry.entityType || "—"}
                      {entry.entityId ? <span className="admin-dash"> · {entry.entityId}</span> : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="3"><div className="admin-empty-state">No recorded activity yet.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={data.pagination} onPageChange={load} />
      </section>
    </section>
  );
}
