import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { createAdminStaff, getAdminStaff } from "../../api/admin";
import { useSession } from "../../lib/SessionContext";
import { isSuperAdmin, PERMISSION_KEYS, PERMISSION_LABELS } from "../../lib/roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Creates a new staff (admin) account — email confirmation and any 2FA step
// are deliberately skipped, and the initial password is the email itself, so
// the account is immediately usable. must_change_password forces a real
// password on first login (see SetAdminPasswordPage). All access is ticked
// by default, matching the "existing accounts keep full access" default.
function AddStaffModal({ onClose, onCreated }) {
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState(PERMISSION_KEYS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function togglePermission(key) {
    setPermissions((current) =>
      current.includes(key) ? current.filter((p) => p !== key) : [...current, key]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError("Enter a valid email address (e.g. name@example.com).");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const staff = await createAdminStaff(value, permissions);
      onCreated(staff);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="add-staff-title" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2 id="add-staff-title">Add staff</h2>
            <p>Creates an admin account. Sign-in password starts as the email itself.</p>
          </div>
          <button type="button" className="admin-icon-btn subtle" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="admin-modal-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoFocus
              required
            />
          </label>

          <div>
            <span style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13 }}>Access</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PERMISSION_KEYS.map((key) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(key)}
                    onChange={() => togglePermission(key)}
                    style={{ width: 16, height: 16, flex: "0 0 auto", padding: 0, border: "1px solid var(--admin-border)", borderRadius: 4, background: "none" }}
                  />
                  {PERMISSION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          {error ? <p className="admin-feedback error">{error}</p> : null}
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-btn compact" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="admin-primary-btn compact" disabled={saving}>
              {saving ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Read-only staff list — the backend route (GET /api/admin/staff) rejects
// anything but the superadmin role, and Supabase Auth never exposes
// passwords via the SDK, so this page only ever shows account metadata.
export default function AdminStaffModerationPage() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin(session)) return;
    let active = true;
    setLoading(true);
    setError("");
    getAdminStaff()
      .then((payload) => { if (active) setItems(payload.items || []); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  if (!isSuperAdmin(session)) {
    return (
      <div className="admin-feedback error">
        <ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Only the superadmin account can view staff moderation.
      </div>
    );
  }

  function handleCreated(staff) {
    setItems((current) => [...current, staff].sort((a, b) => a.email.localeCompare(b.email)));
    setAddingStaff(false);
  }

  return (
    <section className="admin-vendors-page">
      {error ? <div className="admin-feedback error">{error}</div> : null}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="admin-primary-btn compact"
          style={{ width: 100, justifyContent: "center", background: "var(--admin-success-text)" }}
          onClick={() => setAddingStaff(true)}
        >
          Add staff
        </button>
      </div>

      <section className="admin-panel admin-table-panel">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last sign-in</th>
                <th>Email verified</th>
                <th>Must change password</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7"><div className="admin-feedback">Loading staff accounts…</div></td></tr>
              ) : items.length ? (
                items.map((staff) => (
                  <tr
                    key={staff.id}
                    onClick={() => navigate(`/admin/staff/${staff.id}`, { state: { email: staff.email } })}
                    style={{ cursor: "pointer" }}
                    title="View activity log"
                  >
                    <td><strong>{staff.email}</strong></td>
                    <td>
                      <span className={`admin-status-pill ${staff.role === "superadmin" ? "active" : "draft"}`}>
                        {staff.role}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-status-pill ${staff.status === "suspended" ? "suspended" : "active"}`}>
                        {staff.status === "suspended" ? "Suspended" : "Active"}
                      </span>
                    </td>
                    <td>{staff.createdAt ? new Date(staff.createdAt).toLocaleString() : "—"}</td>
                    <td>{staff.lastSignInAt ? new Date(staff.lastSignInAt).toLocaleString() : "Never"}</td>
                    <td>{staff.emailConfirmedAt ? "Yes" : "No"}</td>
                    <td>{staff.mustChangePassword ? "Yes" : "No"}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7"><div className="admin-empty-state">No staff accounts found.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {addingStaff && (
        <AddStaffModal onClose={() => setAddingStaff(false)} onCreated={handleCreated} />
      )}
    </section>
  );
}
