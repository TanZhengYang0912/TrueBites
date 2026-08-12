import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bell, CheckCircle2 } from "lucide-react";
import { getAdminDashboard } from "../../api/admin";

// Reuses the same "needs attention" data the dashboard KPI panel shows
// (draft vendors, missing address/hours, hidden reviews) as a full
// notification feed — there's no separate notifications table, this is
// just the console's existing "things that need a decision" signal.
export default function AdminNotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getAdminDashboard()
      .then((payload) => { if (active) setItems(payload.attentionItems || []); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="admin-vendors-page">
      {error ? <div className="admin-feedback error">{error}</div> : null}

      <section className="admin-panel admin-attention-panel">
        <div className="admin-panel-header">
          <div>
            <h2>Notifications</h2>
            <p>Items that need an admin decision</p>
          </div>
          <Bell size={17} className="admin-panel-heading-icon" />
        </div>
        <div className="admin-attention-list">
          {loading ? (
            <div className="admin-feedback">Loading notifications…</div>
          ) : items.length ? (
            items.map((item) => (
              <Link className="admin-attention-row" to={item.href || "/admin"} key={item.id}>
                <span className={`admin-attention-dot ${item.tone || "neutral"}`} />
                <span className="admin-attention-copy">{item.label}</span>
                <strong>{item.value}</strong>
                <ArrowRight size={15} />
              </Link>
            ))
          ) : (
            <div className="admin-empty-state">
              <CheckCircle2 size={20} />
              <span>No notifications — you're all caught up.</span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
