import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import TrueBitesLogo from "../TrueBitesLogo";

// Transparent over the hero, transitions to solid chalk on scroll.
// Logo: TRUEBITES (Playfair) + MELAKA · MALAYSIA sub-label (Inter caps).
// PLAN VISIT → /map is the only primary action.
const NAV_BASE =
  "fixed inset-x-0 top-0 z-[100] flex min-h-16 items-center justify-between px-5 py-3 transition-colors md:px-12";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const solid = scrolled;

  return (
    <nav
      className={solid
        ? `${NAV_BASE} border-b border-sand bg-chalk/95 backdrop-blur-md`
        : `${NAV_BASE} border-b border-transparent bg-transparent`}
    >
      {/* Wordmark */}
      <Link to="/" aria-label="Back to TrueBites home" className="flex items-center no-underline">
        <TrueBitesLogo size="header" tone={solid ? "default" : "light"} />
      </Link>

      <div className="flex items-center gap-2">
        <Link
          to="/discover"
          className={solid
            ? "flex min-h-11 items-center justify-center rounded-3xl border-[1.5px] border-forest bg-forest px-6 font-body text-xs font-semibold uppercase tracking-[1px] text-white no-underline transition-colors hover:bg-forest-light motion-reduce:transition-none"
            : "flex min-h-11 items-center justify-center rounded-3xl border-[1.5px] border-forest bg-forest px-6 font-body text-xs font-semibold uppercase tracking-[1px] text-white no-underline transition-colors hover:bg-forest-light md:border-white/70 motion-reduce:transition-none"}
        >
          Plan Visit
        </Link>
      </div>
    </nav>
  );
}
