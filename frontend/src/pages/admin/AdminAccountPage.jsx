import { useSession } from "../../lib/SessionContext";

// Read-only account details. There is deliberately no change-password form:
// an admin password can only be set with backend/scripts/setAdminPassword.js,
// which uses the Supabase service key. See that script's header for why.
export default function AdminAccountPage() {
  const { session } = useSession();
  const user = session?.user;

  if (!user) return null;

  return (
    <section className="admin-vendors-page">
      <section className="admin-panel" style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
        <div>
          <h3 style={{ margin: "0 0 10px" }}>Account</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <div><strong>Email:</strong> {user.email}</div>
            <div>
              <strong>Role:</strong>{" "}
              <span className="admin-status-pill active">Admin</span>
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
          <p style={{ margin: 0, fontSize: 14, color: "var(--admin-muted)" }}>Full access to all moderation activities.</p>
        </div>

        <div>
          <h3 style={{ margin: "0 0 10px" }}>Password</h3>
          <p style={{ margin: 0, fontSize: 14, color: "var(--admin-muted)" }}>
            Admin passwords are not self-service. Contact whoever holds the project&rsquo;s
            Supabase service key to have yours changed.
          </p>
        </div>
      </section>
    </section>
  );
}
