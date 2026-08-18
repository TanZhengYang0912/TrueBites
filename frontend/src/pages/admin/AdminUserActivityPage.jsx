import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileDown } from "lucide-react";
import { getAdminUserActivity } from "../../api/admin";
import { fetchAllPages, openActivityLogPdf } from "../../lib/exportPdf";

function formatAction(action) {
  return String(action || "").replace(/[._]/g, " ");
}

// Read-only — full activity log for one customer account (what they did,
// and when). Reached by clicking a row on the User Moderation panel.
export default function AdminUserActivityPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getAdminUserActivity(id)
      .then((payload) => { if (active) setData(payload); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const email = data?.user?.email || state?.email || "—";
  const displayName = data?.user?.displayName || state?.displayName || null;
  const items = data?.items || [];

  async function handleExport() {
    setExporting(true);
    try {
      const entries = await fetchAllPages((pageOpts) => getAdminUserActivity(id, pageOpts));
      await openActivityLogPdf({
        title: `Activity Log — ${displayName || email}`,
        subtitle: displayName ? email : undefined,
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
      <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
        <button
          type="button"
          className="admin-secondary-btn compact"
          onClick={() => navigate("/admin/users")}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <ArrowLeft size={13} />
          Back
        </button>
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

      <div className="admin-panel-header" style={{ marginBottom: 0 }}>
        <div>
          <h2>{displayName || email}</h2>
          <p>{displayName ? email : "Full activity log"}</p>
        </div>
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
                <tr><td colSpan="3"><div className="admin-feedback">Loading activity…</div></td></tr>
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
                <tr><td colSpan="3"><div className="admin-empty-state">No recorded activity for this user yet.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
