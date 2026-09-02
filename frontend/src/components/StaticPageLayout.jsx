import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { customerSession } from "../lib/roles";
import DiscoveryHeader from "./discovery/DiscoveryHeader";
import Footer from "./Footer";

// Shared chrome for the static info pages linked from Footer.jsx (About,
// Terms, Guidelines, Contact, Careers). Content is filler for now — each
// page just supplies a title and body copy.
export default function StaticPageLayout({ eyebrow = "TrueBites", title, children }) {
  const navigate = useNavigate();
  const { session: authSession } = useSession();
  const session = customerSession(authSession);
  const meta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = meta.avatar_url || "";
  const firstName = meta.first_name || "";
  const initials = firstName
    ? (meta.first_name?.[0] || "") + (meta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");

  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <DiscoveryHeader
        onOpenMap={() => navigate("/map?view=map")}
        session={session}
        userEmail={userEmail}
        initials={initials}
        firstName={firstName}
        avatarUrl={avatarUrl}
        savedCount={0}
        activeSection={null}
        onOpenDiscover={() => navigate("/map")}
        onLogin={() => navigate("/login")}
        onSignUp={() => navigate("/login")}
        onOpenProfile={() => navigate("/profile")}
        onOpenVendor={(id) => navigate(`/map?vendor=${id}`)}
      />

      <main className="mx-auto w-full max-w-[1360px] px-4 pb-16 pt-8 md:px-6 md:pb-18 md:pt-12 xl:px-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="mb-0 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">{eyebrow}</p>
          <Link
            to="/map"
            className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:text-forest"
          >
            ← Back to Discover
          </Link>
        </div>
        <h1 className="mb-8 font-display text-[clamp(28px,4vw,44px)] font-medium leading-[1.1] tracking-[-0.03em] text-ink">
          {title}
        </h1>
        <div className="flex flex-col gap-5 text-[15px] leading-relaxed text-ink/80">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
