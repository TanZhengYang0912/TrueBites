import { useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useSession } from "../../lib/SessionContext";
import { isSuperAdmin, PERMISSION_KEYS, PERMISSION_LABELS, hasPermission } from "../../lib/roles";
import { logActivity } from "../../lib/activityLog";

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const FIELD_STYLE = {
  width: "100%",
  border: "1px solid var(--admin-border)",
  borderRadius: 10,
  padding: "9px 12px",
  background: "var(--admin-panel-soft)",
  font: "inherit",
  fontSize: 13,
  outline: "none",
};

// Self-service — any signed-in admin/superadmin manages their own account
// here. Password change re-authenticates with the current password first
// (Supabase's client SDK has no separate "verify current password" call),
// then updates immediately — no 2FA step, matching every other password
// flow in this app.
export default function AdminAccountPage() {
  const { session } = useSession();
  const user = session?.user;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!user) return null;

  const role = user.app_metadata?.role || "admin";
  const superadmin = isSuperAdmin(session);

  async function handleChangePassword(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (!PASSWORD_RE.test(newPassword)) {
      setError("New password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setSaving(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      logActivity("auth.password_change");
      setSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-vendors-page">
      <section className="admin-panel" style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
        <div>
          <h3 style={{ margin: "0 0 10px" }}>Account</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <div><strong>Email:</strong> {user.email}</div>
            <div>
              <strong>Role:</strong>{" "}
              <span className={`admin-status-pill ${superadmin ? "active" : "draft"}`}>{role}</span>
            </div>
            <div>
              <strong>Status:</strong>{" "}
              <span className="admin-status-pill active">Active</span>
            </div>
            <div><strong>Account created:</strong> {user.created_at ? new Date(user.created_at).toLocaleString() : "—"}</div>
            <div><strong>Last sign-in:</strong> {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "—"}</div>
          </div>
        </div>

        <div>
          <h3 style={{ margin: "0 0 10px" }}>Access</h3>
          {superadmin ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--admin-muted)" }}>Full access (superadmin).</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PERMISSION_KEYS.map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, opacity: hasPermission(session, key) ? 1 : 0.4 }}>
                  {hasPermission(session, key) ? <Check size={15} /> : <span style={{ width: 15 }} />}
                  {PERMISSION_LABELS[key]}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 style={{ margin: "0 0 12px" }}>Change password</h3>
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-navy)" }}>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={FIELD_STYLE}
                required
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-navy)" }}>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={FIELD_STYLE}
                required
                minLength={8}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-navy)" }}>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={FIELD_STYLE}
                required
                minLength={8}
              />
            </label>

            {error ? <p className="admin-feedback error">{error}</p> : null}
            {success ? <p className="admin-feedback">{success}</p> : null}

            <button type="submit" className="admin-primary-btn compact" disabled={saving} style={{ alignSelf: "flex-start" }}>
              {saving ? "Updating…" : "Change password"}
            </button>
          </form>
        </div>
      </section>
    </section>
  );
}
