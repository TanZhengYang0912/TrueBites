import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import {
  deleteAdminStaff,
  getAdminStaffDetail,
  setStaffPermissions,
  setStaffStatus,
} from "../../api/admin";
import { useSession } from "../../lib/SessionContext";
import { isSuperAdmin, PERMISSION_KEYS, PERMISSION_LABELS } from "../../lib/roles";

// Superadmin-only. Status/suspend use Supabase Auth's own ban mechanism (a
// suspended account genuinely can't sign in, not just a hidden flag).
// Permission toggles save immediately — there's no separate "Save" step.
export default function AdminStaffManagePage() {
  const { session } = useSession();
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null); // "status" | permission key | "delete"
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin(session)) return;
    let active = true;
    setLoading(true);
    setError("");
    getAdminStaffDetail(id)
      .then((payload) => { if (active) setStaff(payload); })
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

  async function toggleStatus() {
    if (!staff) return;
    const next = staff.status === "suspended" ? "active" : "suspended";
    setBusyKey("status");
    setError("");
    try {
      await setStaffStatus(id, next);
      setStaff((current) => ({ ...current, status: next }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function togglePermission(key) {
    if (!staff) return;
    const next = staff.permissions.includes(key)
      ? staff.permissions.filter((p) => p !== key)
      : [...staff.permissions, key];
    setBusyKey(key);
    setError("");
    try {
      const result = await setStaffPermissions(id, next);
      setStaff((current) => ({ ...current, permissions: result.permissions }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove() {
    setConfirmRemove(false);
    setBusyKey("delete");
    setError("");
    try {
      await deleteAdminStaff(id);
      navigate("/admin/staff", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusyKey(null);
    }
  }

  const email = staff?.email || state?.email || "—";
  const disabled = !staff || staff.isSelf;

  return (
    <section className="admin-vendors-page">
      <button
        type="button"
        className="admin-secondary-btn compact"
        onClick={() => navigate(`/admin/staff/${id}`)}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start", marginBottom: 4 }}
      >
        <ArrowLeft size={13} />
        Back
      </button>

      <div className="admin-panel-header" style={{ marginBottom: 0 }}>
        <div>
          <h2>Manage account</h2>
          <p>{email}</p>
        </div>
      </div>

      {error ? <div className="admin-feedback error">{error}</div> : null}
      {staff?.isSelf ? <div className="admin-feedback">You can't manage your own account from here.</div> : null}

      {loading ? (
        <div className="admin-feedback">Loading account…</div>
      ) : staff ? (
        <section className="admin-panel" style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>Status</h3>
            <span className={`admin-status-pill ${staff.status === "active" ? "active" : "suspended"}`}>
              {staff.status === "active" ? "Active" : "Suspended"}
            </span>
          </div>

          <div>
            <h3 style={{ margin: "0 0 10px" }}>Current access</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PERMISSION_KEYS.map((key) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={staff.permissions.includes(key)}
                    disabled={disabled || busyKey === key}
                    onChange={() => togglePermission(key)}
                  />
                  {PERMISSION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ margin: "0 0 10px" }}>Actions</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="admin-secondary-btn compact"
                onClick={toggleStatus}
                disabled={disabled || busyKey === "status"}
              >
                {staff.status === "active" ? "Suspend Account" : "Reactivate Account"}
              </button>
              <button
                type="button"
                className="admin-primary-btn compact danger"
                onClick={() => setConfirmRemove(true)}
                disabled={disabled || busyKey === "delete"}
              >
                Remove Account
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {confirmRemove && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setConfirmRemove(false)}>
          <div className="admin-modal-card admin-confirm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2>Remove this account?</h2>
                <p>{email}</p>
              </div>
              <button type="button" className="admin-icon-btn subtle" onClick={() => setConfirmRemove(false)} aria-label="Close">×</button>
            </div>
            <div className="admin-modal-form">
              <p className="admin-confirm-message">
                This permanently deletes the account. This can't be undone.
              </p>
              <div className="admin-modal-actions">
                <button type="button" className="admin-secondary-btn compact" onClick={() => setConfirmRemove(false)}>Cancel</button>
                <button type="button" className="admin-primary-btn compact danger" onClick={handleRemove}>Remove account</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
