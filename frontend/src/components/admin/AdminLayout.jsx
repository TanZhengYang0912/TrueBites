import { useState, useEffect } from "react";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../lib/SessionContext";
import {
  Bell,
  BrainCircuit,
  History,
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
import { getAppealsPendingCount } from "../../api/admin";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/vendors2", label: "Vendors", icon: Store },
  { to: "/admin/ai", label: "AI Content Queue", icon: BrainCircuit },
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

  async function handleSignOut() {
    // Navigate to the (public) admin login route before clearing the
    // session — AuthGate reacts to session becoming null and redirects
    // away from any non-public path, and it can win a race against a
    // navigate() called after signOut() resolves, landing on /login
    // instead of the admin login page.
    navigate("/wsdasabi123&admin-login", { replace: true });
    await supabase.auth.signOut();
  }
  // Notifications and Account are reachable only via the bell icon / user
  // card, not a sidebar tab, so they aren't in NAV_ITEMS — checked first or
  // they'd fall through to "Overview".
  const pageName = location.pathname.startsWith("/admin/notifications")
    ? "Notifications"
    : location.pathname.startsWith("/admin/account")
    ? "Account"
    : NAV_ITEMS.find((item) =>
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
      )?.label || "Overview";

  const subtitleMap = {
    Overview: "Operational view of the TrueBites platform",
    Vendors: "Manage food vendor listings and approval",
    "AI Content Queue": "Review AI-extracted vendor content before it goes live",
    "Review Moderation": "Moderate user reviews and keep vendor content trustworthy",
    "User Moderation": "View customer accounts and their activity history",
    "My Audit Log": "Everything you've personally done in the admin console",
    "Platform Settings": "Platform configuration and preferences",
    Notifications: "Items that need an admin decision",
    Account: "Your account details and password",
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
            <button
              className="admin-icon-btn"
              aria-label="Notifications"
              onClick={() => navigate("/admin/notifications")}
            >
              <Bell size={16} />
              <span className="admin-notification-dot" />
            </button>
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
