import { useState, useEffect } from "react";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../lib/SessionContext";
import { isSuperAdmin, hasPermission } from "../../lib/roles";
import {
  Bell,
  BrainCircuit,
  KeyRound,
  Lightbulb,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareWarning,
  Settings,
  SquareArrowOutUpRight,
  Store,
  X,
} from "lucide-react";
import { supabase } from "../../supabaseClient";

// `perm` maps a tab to the app_metadata.permissions key that gates it (see
// lib/roles.js). Overview has no perm — every admin can always see it.
const BASE_NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/vendors2", label: "Vendors", icon: Store, perm: "vendors" },
  { to: "/admin/ai", label: "AI Content Queue", icon: BrainCircuit, perm: "ai" },
  { to: "/admin/suggestions", label: "Community Suggestions", icon: Lightbulb, perm: "suggestions" },
  { to: "/admin/reviews", label: "Review Moderation", icon: MessageSquareWarning, perm: "reviews" },
  { to: "/admin/settings", label: "Platform Settings", icon: Settings, perm: "settings" },
];

const ACCESS_DENIED_MESSAGE = "Your moderator has disabled access for this function. Please contact your moderator to gain access.";

// Superadmin-only tab — lets the seeded superadmin account view (read-only)
// the credentials of other staff/admin accounts. Hidden for regular admins.
const STAFF_NAV_ITEM = { to: "/admin/staff", label: "Staff Moderation", icon: KeyRound };

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [topbarAction, setTopbarAction] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deniedMsg, setDeniedMsg] = useState("");
  const { session } = useSession();
  const adminEmail = session?.user?.email || "";
  const navItems = isSuperAdmin(session) ? [...BASE_NAV_ITEMS, STAFF_NAV_ITEM] : BASE_NAV_ITEMS;

  // Navigating from the drawer should close it, or the new page opens hidden
  // behind the overlay on a phone.
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!deniedMsg) return;
    const t = setTimeout(() => setDeniedMsg(""), 3200);
    return () => clearTimeout(t);
  }, [deniedMsg]);

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
  // card, not a sidebar tab, so they aren't in navItems — checked first or
  // they'd fall through to "Overview".
  const pageName = location.pathname.startsWith("/admin/notifications")
    ? "Notifications"
    : location.pathname.startsWith("/admin/account")
    ? "Account"
    : navItems.find((item) =>
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
      )?.label || "Overview";

  const subtitleMap = {
    Overview: "Operational view of the TrueBites platform",
    Vendors: "Manage food vendor listings and approval",
    "AI Content Queue": "Review AI-extracted vendor content before it goes live",
    "Community Suggestions": "Review hidden-gem submissions from TrueBites customers",
    "Review Moderation": "Moderate user reviews and keep vendor content trustworthy",
    "Platform Settings": "Platform configuration and preferences",
    "Staff Moderation": "View credentials of existing staff accounts (read-only)",
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
          {navItems.map(({ to, label, icon: Icon, end, perm }) => {
            if (perm && !hasPermission(session, perm)) {
              return (
                <button
                  key={to}
                  type="button"
                  className="admin-nav-item is-disabled"
                  aria-disabled="true"
                  onClick={() => setDeniedMsg(ACCESS_DENIED_MESSAGE)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              );
            }
            return (
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
              </NavLink>
            );
          })}
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
          <Outlet context={{ setTopbarAction }} />
        </main>
      </div>

      {deniedMsg && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1200,
            maxWidth: 320,
            padding: "10px 16px",
            borderRadius: 10,
            background: "var(--admin-danger-text)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.4,
            boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
          }}
        >
          {deniedMsg}
        </div>
      )}
    </div>
  );
}
