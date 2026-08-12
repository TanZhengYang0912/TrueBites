import { useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { isAdmin } from "../lib/roles";

// Admins can browse the public/customer site like a guest (see AuthGate in
// App.jsx). This banner makes that state obvious and gives a one-click way
// back, instead of leaving them to remember they're not actually a customer.
const ADMIN_AUTH_PATHS = ["/wsdasabi123&admin-login", "/admin-set-password"];

export default function AdminViewingBar() {
  const { session } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const onAdminSurface = location.pathname.startsWith("/admin") || ADMIN_AUTH_PATHS.includes(location.pathname);
  if (!isAdmin(session) || onAdminSurface) return null;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[2000] flex min-h-9 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-forest px-4 py-1.5 text-center text-[13px] font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
        <span>You are viewing as an admin.</span>
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="rounded-full border border-white/40 px-3 py-0.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/15"
        >
          Exit to Admin Panel
        </button>
      </div>
      {/* Reserves space so fixed-position page content isn't hidden under the bar. */}
      <div aria-hidden className="h-9" />
    </>
  );
}
