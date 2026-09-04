import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../lib/SessionContext";
import {
  Bell,
  ArrowRight,
  BrainCircuit,
  History,
  Lightbulb,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareWarning,
  Settings,
  SquareArrowOutUpRight,
  Store,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../../supabaseClient";
import { getAdminDashboard, getAppealsPendingCount } from "../../api/admin";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/vendors2", label: "Vendors", icon: Store },
  { to: "/admin/ai", label: "AI Content Queue", icon: BrainCircuit },
  { to: "/admin/suggestions", label: "Community Suggestions", icon: Lightbulb },
  { to: "/admin/reviews", label: "Review Moderation", icon: MessageSquareWarning },
  { to: "/admin/users", label: "User Moderation", icon: Users },
  { to: "/admin/audit-log", label: "My Audit Log", icon: History },
  { to: "/admin/settings", label: "Platform Settings", icon: Settings },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [topbarAction, setTopbarAction] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const notificationRef = useRef(null);
  const { session } = useSession();
  const adminEmail = session?.user?.email || "";
  const [pendingAppeals, setPendingAppeals] = useState(0);

  function refreshAppealBadge() {
    getAppealsPendingCount().then(({ count }) => setPendingAppeals(count)).catch(() => {});
  }

  // Navigating from the drawer should close it, or the new page opens hidden
  // behind the overlay on a phone.
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Refetched on every navigation too, not just mount — cheap query, and it
  // means the badge catches up after an admin resolves an appeal and moves
  // to a different tab, without needing the two pages to talk to each other.
  useEffect(() => { refreshAppealBadge(); }, [location.pathname]);

  useEffect(() => {
    let active = true;
    getAdminDashboard()
      .then((payload) => {
        if (active) setNotificationItems(payload.attentionItems || []);
      })
      .catch(() => {
        if (active) setNotificationItems([]);
      })
      .finally(() => {
        if (active) setNotificationLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!notificationOpen) return undefined;

    function handlePointerDown(event) {
      if (!notificationRef.current?.contains(event.target)) setNotificationOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setNotificationOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationOpen]);

  async function handleSignOut() {
    // Navigate to the (public) admin login route before clearing the
    // session — AuthGate reacts to session becoming null and redirects
    // away from any non-public path, and it can win a race against a
    // navigate() called after signOut() resolves, landing on /login
    // instead of the admin login page.
    navigate("/wsdasabi123&admin-login", { replace: true });
    await supabase.auth.signOut();
  }
  // Account is reachable via the user card, not a sidebar tab. Notifications
  // lives in the topbar bell popover rather than a duplicate page.
  const pageName = location.pathname.startsWith("/admin/account")
    ? "Account"
    : NAV_ITEMS.find((item) =>
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
      )?.label || "Overview";

  const subtitleMap = {
    Overview: "Operational view of the TrueBites platform",
    Vendors: "Manage food vendor listings and approval",
    "AI Content Queue": "Review AI-extracted vendor content before it goes live",
    "Community Suggestions": "Review hidden-gem submissions from TrueBites customers",
    "Review Moderation": "Moderate user reviews and keep vendor content trustworthy",
    "User Moderation": "View customer accounts and their activity history",
    "My Audit Log": "Everything you've personally done in the admin console",
    "Platform Settings": "Platform configuration and preferences",
    Account: "Your account details",
  };

  return (
    <div className="admin-shell">
      {sidebarOpen && (
        <button
          className="admin-drawer-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={sidebarOpen ? "admin-sidebar is-open" : "admin-sidebar"}>
        <button
          className="admin-drawer-close"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={18} />
        </button>
        <div className="admin-brand">
          <Link to="/admin" className="admin-brand-link">
            <div className="admin-brand-wordmark">TRUEBITES</div>
            <div className="admin-brand-sub">ADMIN CONSOLE</div>
          </Link>
        </div>

        <nav className="admin-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `admin-nav-item${isActive ? " active" : ""}`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
              {to === "/admin/users" && pendingAppeals > 0 && (
                <span className="admin-nav-badge">{pendingAppeals > 9 ? "9+" : pendingAppeals}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-user-card is-button"
            onClick={() => navigate("/admin/account")}
          >
            <div className="admin-avatar">{(adminEmail[0] || "A").toUpperCase()}</div>
            <div>
              <div className="admin-user-name">Admin</div>
              <div className="admin-user-email">{adminEmail || "—"}</div>
            </div>
          </button>
          <button className="admin-signout" onClick={handleSignOut}>
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-drawer-toggle"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div>
            <h1>{pageName}</h1>
            <p>{subtitleMap[pageName]}</p>
          </div>
          <div className="admin-topbar-actions">
            {topbarAction}
            <div className="admin-notification-control" ref={notificationRef}>
              <button
                className="admin-icon-btn"
                aria-label="Notifications"
                aria-expanded={notificationOpen}
                aria-controls="admin-notification-popover"
                onClick={() => setNotificationOpen((open) => !open)}
              >
                <Bell size={16} />
                {notificationItems.length > 0 && <span className="admin-notification-dot" />}
              </button>
              {notificationOpen && (
                <section
                  id="admin-notification-popover"
                  className="admin-notification-popover"
                  role="dialog"
                  aria-label="Admin notifications"
                >
                  <div className="admin-notification-popover-header">
                    <div>
                      <h2>Notifications</h2>
                      <p>Items that need an admin decision</p>
                    </div>
                    <Bell size={17} />
                  </div>
                  <div className="admin-notification-list">
                    {notificationLoading ? (
                      <div className="admin-notification-feedback">Loading notifications…</div>
                    ) : notificationItems.length ? (
                      notificationItems.map((item) => (
                        <Link
                          className="admin-notification-row"
                          to={item.href || "/admin"}
                          key={item.id}
                          onClick={() => setNotificationOpen(false)}
                        >
                          <span className={`admin-attention-dot ${item.tone || "neutral"}`} />
                          <span className="admin-notification-copy">{item.label}</span>
                          <strong>{item.value}</strong>
                          <ArrowRight size={15} />
                        </Link>
                      ))
                    ) : (
                      <div className="admin-notification-feedback">No pending notifications.</div>
                    )}
                  </div>
                </section>
              )}
            </div>
            <Link className="admin-view-site" to="/">
              <SquareArrowOutUpRight size={15} />
              <span>View Site</span>
            </Link>
          </div>
        </header>

        <main className="admin-content">
          <Outlet context={{ setTopbarAction, refreshAppealBadge }} />
        </main>
      </div>
    </div>
  );
}
