import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getAdminStaffActivity } from "../../api/admin";
import { useSession } from "../../lib/SessionContext";
import { isSuperAdmin } from "../../lib/roles";

function formatAction(action) {
  return String(action || "").replace(/[._]/g, " ");
}

// Superadmin-only, read-only — full activity log for one staff member.
// Reached by clicking a row on the Staff Moderation panel; "Back" returns
// there instead of popping a modal, so the URL/history reflects where you are.
export default function AdminStaffActivityPage() {
  const { session } = useSession();
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSuperAdmin(session)) return;
    let active = true;
    setLoading(true);
    setError("");
    getAdminStaffActivity(id)
      .then((payload) => { if (active) setData(payload); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, id]);

  if (!isSuperAdmin(session)) {
    return (
      <div className="admin-feedback error">
        <ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Only the superadmin account can view staff moderation.
      </div>
    );
  }

  const email = data?.staff?.email || state?.email || "—";
  const items = data?.items || [];

  return (
    <section className="admin-vendors-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <button
          type="button"
          className="admin-secondary-btn compact"
          onClick={() => navigate("/admin/staff")}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <ArrowLeft size={13} />
          Back
        </button>

        <button
          type="button"
          className="admin-secondary-btn compact"
          onClick={() => navigate(`/admin/staff/${id}/manage`, { state: { email } })}
        >
          Manage Account
        </button>
      </div>

      <div className="admin-panel-header" style={{ marginBottom: 0 }}>
        <div>
          <h2>{email}</h2>
          <p>{data?.staff?.role ? `Role: ${data.staff.role}` : "Full activity log"}</p>
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
                <tr><td colSpan="3"><div className="admin-empty-state">No recorded activity for this account yet.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
