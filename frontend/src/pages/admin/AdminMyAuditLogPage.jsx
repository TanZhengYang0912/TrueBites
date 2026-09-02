import { FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getMyActivity } from "../../api/admin";
import { formatAuditEntry } from "../../lib/auditLogReport";
import { openMyAuditLogPdf } from "../../lib/myAuditLogExport";
import { useSession } from "../../lib/SessionContext";

const PAGE_SIZE = 25;

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
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportGuard = useRef(false);
  const exportController = useRef(null);

  const load = (page = 1) => {
    setLoading(true);
    setError("");
    return getMyActivity({ page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // A personal export must not outlive the account that started it. The
  // cleanup also runs when leaving this route, so a pending export cannot
  // publish a report after the page has been unmounted.
  useEffect(() => () => {
    exportController.current?.abort();
    exportController.current = null;
  }, [session?.user?.id]);

  const items = data.items || [];

  async function handleExport() {
    // React state updates after the click handler returns. The ref closes the
    // smaller race where a second click lands before that re-render disables
    // the button, while also keeping the preview reservation synchronous.
    if (exportGuard.current) return;
    exportGuard.current = true;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError("");
    try {
      await openMyAuditLogPdf(getMyActivity, { signal: controller.signal });
    } catch (err) {
      setExportError(err?.message || "Could not prepare your audit log PDF. Please try again.");
    } finally {
      if (exportController.current === controller) exportController.current = null;
      exportGuard.current = false;
      setExporting(false);
    }
  }

  return (
    <section className="admin-vendors-page">
      {error ? <div className="admin-feedback error">{error}</div> : null}

      <div className="admin-audit-log-toolbar">
        <button type="button" className="admin-secondary-btn compact" onClick={handleExport} disabled={exporting}>
          <FileDown size={14} />
          {exporting ? "Preparing PDF…" : "Export PDF"}
        </button>
      </div>
      {exportError ? <div className="admin-feedback error admin-audit-log-export-error" role="alert">{exportError}</div> : null}

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
                items.map((entry) => {
                  const row = formatAuditEntry(entry);
                  return (
                    <tr key={row.id ?? entry.id}>
                      <td>{row.when}</td>
                      <td>{row.action}</td>
                      <td>{row.entity}</td>
                    </tr>
                  );
                })
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
