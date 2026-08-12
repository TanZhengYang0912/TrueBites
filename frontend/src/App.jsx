import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import LandingPage    from "./pages/LandingPage";
import MapPage        from "./pages/MapPage";
import LoginPage      from "./pages/LoginPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import SetAdminPasswordPage from "./pages/SetAdminPasswordPage";
import ProfilePage    from "./pages/ProfilePage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import VendorsPage    from "./pages/VendorsPage";
import DevPinPrecision from "./pages/DevPinPrecision";
import AIPage         from "./pages/AIPage";
import EngagementPage from "./pages/EngagementPage";
import AdminLayout                     from "./components/admin/AdminLayout";
import AdminDashboardPage              from "./pages/admin/AdminDashboardPage";
import AdminVendorManagementPage       from "./pages/admin/AdminVendorManagementPage";
import AdminAIProcessingConsolePage    from "./pages/admin/AdminAIProcessingConsolePage";
import AdminReviewModerationPage       from "./pages/admin/AdminReviewModerationPage";
import AdminSettingsPage               from "./pages/admin/AdminSettingsPage";
import { DISABLE_AUTH } from "./lib/testMode";
import { randomDisplayName } from "./lib/randomName";

// Pages that can be visited without any session. Guests can freely browse the
// discovery map; login-only features (engagement hub, profile) stay gated and
// redirect guests to /login. Admins may browse everything a guest can.
const AUTH_PUBLIC_PATHS = ["/", "/map", "/login", "/onboarding", "/wsdasabi123&admin-login", "/admin-set-password", "/reset-password"];

function AuthGate({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // ponytail: TEMPORARY — auth fully disabled for local testing, see lib/testMode.js
    if (DISABLE_AUTH) return;

    function check(session) {
      if (!session) {
        if (!AUTH_PUBLIC_PATHS.includes(location.pathname)) {
          navigate("/login", { replace: true });
        }
        return;
      }

      const role = session.user.app_metadata?.role;

      // Customers (non-admins) can never enter the admin console. Admins can go
      // anywhere — including browsing the public site like a guest.
      if (role !== "admin" && (location.pathname === "/admin" || location.pathname.startsWith("/admin/"))) {
        navigate("/map", { replace: true });
        return;
      }

      // Onboarding is optional — we never force it. But every account should
      // carry a display name for reviews, so lazily assign a random one to any
      // account that has none (existing accounts, Google sign-ins, etc.).
      if (role !== "admin" && !session.user.user_metadata?.first_name) {
        supabase.auth.updateUser({ data: { first_name: randomDisplayName() } });
      }
    }
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => check(s));
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/vendors"   element={<VendorsPage />} />

          {/* Dev-only design preview, tree-shaken out of production builds. */}
          {import.meta.env.DEV && <Route path="/dev/map" element={<DevPinPrecision />} />}
          <Route path="/ai"        element={<AIPage />} />
          <Route path="/engagement" element={<EngagementPage />} />

          {/* Admin console */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="vendors2" element={<AdminVendorManagementPage />} />
            <Route path="ai" element={<AdminAIProcessingConsolePage />} />
            <Route path="reviews" element={<AdminReviewModerationPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>

          {/* Unknown paths → landing (not /map) */}
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
