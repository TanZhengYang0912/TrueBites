import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { SessionProvider, useSession } from "./lib/SessionContext";
import { isAdmin } from "./lib/roles";
import LandingPage    from "./pages/LandingPage";
import MapPage        from "./pages/MapPage";
import LoginPage      from "./pages/LoginPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import SetAdminPasswordPage from "./pages/SetAdminPasswordPage";
import ProfilePage    from "./pages/ProfilePage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import DevPinPrecision from "./pages/DevPinPrecision";
import EngagementPage from "./pages/EngagementPage";
import SuggestionsPage from "./pages/SuggestionsPage";
import SuggestionFormPage from "./pages/SuggestionFormPage";
import AccountSuspendedPage from "./pages/AccountSuspendedPage";
import AboutPage      from "./pages/AboutPage";
import TermsPage      from "./pages/TermsPage";
import GuidelinesPage from "./pages/GuidelinesPage";
import ContactPage    from "./pages/ContactPage";
import CareersPage    from "./pages/CareersPage";
import AdminLayout                     from "./components/admin/AdminLayout";
import AdminDashboardPage              from "./pages/admin/AdminDashboardPage";
import AdminVendorManagementPage       from "./pages/admin/AdminVendorManagementPage";
import AdminAIProcessingConsolePage    from "./pages/admin/AdminAIProcessingConsolePage";
import AdminReviewModerationPage       from "./pages/admin/AdminReviewModerationPage";
import AdminSettingsPage               from "./pages/admin/AdminSettingsPage";
import AdminSuggestionsPage            from "./pages/admin/AdminSuggestionsPage";
import AdminUserModerationPage         from "./pages/admin/AdminUserModerationPage";
import AdminUserActivityPage           from "./pages/admin/AdminUserActivityPage";
import AdminMyAuditLogPage             from "./pages/admin/AdminMyAuditLogPage";
import AdminAccountPage                from "./pages/admin/AdminAccountPage";
import AdminViewingBar                 from "./components/AdminViewingBar";
import TripFab                         from "./components/TripFab";
import { DISABLE_AUTH } from "./lib/testMode";
import { randomDisplayName } from "./lib/randomName";

// Pages that can be visited without any session. Guests can freely browse the
// discovery map; login-only features (engagement hub, profile) stay gated and
// redirect guests to /login. Admins may browse everything a guest can.
const AUTH_PUBLIC_PATHS = [
  "/", "/map", "/login", "/onboarding", "/wsdasabi123&admin-login", "/admin-set-password", "/reset-password",
  "/about", "/terms", "/guidelines", "/contact", "/careers",
];

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

function AuthGate({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  // Guards the one-time display-name backfill below against firing twice for
  // the same account while its updateUser() call is still in flight (e.g. a
  // fast route change right after login re-running this effect before the
  // resulting onAuthStateChange event lands).
  const backfillingName = useRef(false);

  useEffect(() => {
    // ponytail: TEMPORARY — auth fully disabled for local testing, see lib/testMode.js
    if (DISABLE_AUTH) return;

    // Wait for the initial session read (which also resolves any in-flight
    // OAuth redirect) before deciding whether this is a guest — otherwise a
    // fast navigation right after Google login can be misread as logged-out.
    if (loading) return;

    if (!session) {
      if (!AUTH_PUBLIC_PATHS.includes(location.pathname)) {
        navigate("/login", { replace: true });
      }
      return;
    }

    const admin = isAdmin(session);

    // Customers (non-admins) can never enter the admin console. Admins can go
    // anywhere — including browsing the public site like a guest.
    if (!admin && (location.pathname === "/admin" || location.pathname.startsWith("/admin/"))) {
      navigate("/map", { replace: true });
      return;
    }

    // AI processing is an admin-only surface. Customers can contribute a
    // source video through /suggestions, but they never get the processor UI.
    if (!admin && (location.pathname === "/ai" || location.pathname === "/vendors")) {
      navigate("/map", { replace: true });
      return;
    }

    // Onboarding is optional — we never force it. But every account should
    // carry a display name for reviews, so lazily assign a random one to any
    // account that has none (existing accounts, Google sign-ins, etc.).
    if (!admin && !session.user.user_metadata?.first_name && !backfillingName.current) {
      backfillingName.current = true;
      supabase.auth.updateUser({ data: { first_name: randomDisplayName() } })
        .finally(() => { backfillingName.current = false; });
    }
  }, [location.pathname, session, loading]);

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <SessionProvider>
      <AdminViewingBar />
      <TripFab />
      <AuthGate>
        <Routes>
          {/* Editorial landing — the new front door */}
          <Route path="/"          element={<LandingPage />} />

          {/* Discovery app */}
          <Route path="/map"       element={<MapPage />} />
          <Route path="/login"     element={<LoginPage />} />
          <Route path="/wsdasabi123&admin-login" element={<AdminLoginPage />} />
          <Route path="/admin-set-password" element={<SetAdminPasswordPage />} />
          <Route path="/profile"   element={<ProfilePage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* Dev-only design preview, tree-shaken out of production builds. */}
          {import.meta.env.DEV && <Route path="/dev/map" element={<DevPinPrecision />} />}
          <Route path="/engagement" element={<EngagementPage />} />
          <Route path="/suggestions" element={<SuggestionsPage />} />
          <Route path="/suggestions/new" element={<SuggestionFormPage />} />
          <Route path="/ai" element={<Navigate to="/map" replace />} />
          <Route path="/account-suspended" element={<AccountSuspendedPage />} />

          {/* Static info pages, linked from the footer */}
          <Route path="/about"     element={<AboutPage />} />
          <Route path="/terms"     element={<TermsPage />} />
          <Route path="/guidelines" element={<GuidelinesPage />} />
          <Route path="/contact"   element={<ContactPage />} />
          <Route path="/careers"   element={<CareersPage />} />

          {/* Admin console */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="vendors2" element={<AdminVendorManagementPage />} />
            <Route path="ai" element={<AdminAIProcessingConsolePage />} />
            <Route path="suggestions" element={<AdminSuggestionsPage />} />
            <Route path="reviews" element={<AdminReviewModerationPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="users" element={<AdminUserModerationPage />} />
            <Route path="users/:id" element={<AdminUserActivityPage />} />
            <Route path="audit-log" element={<AdminMyAuditLogPage />} />
            {/* Legacy notification URL now returns to the bell-based popover. */}
            <Route path="notifications" element={<Navigate to="/admin" replace />} />
            <Route path="account" element={<AdminAccountPage />} />
          </Route>

          {/* Unknown paths → landing (not /map) */}
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
      </SessionProvider>
    </BrowserRouter>
  );
}
