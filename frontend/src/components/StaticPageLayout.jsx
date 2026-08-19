import { Link } from "react-router-dom";
import TrueBitesLogo from "./TrueBitesLogo";
import Footer from "./Footer";

// Shared chrome for the static info pages linked from Footer.jsx (About,
// Terms, Guidelines, Contact, Careers). Content is filler for now — each
// page just supplies a title and body copy.
export default function StaticPageLayout({ eyebrow = "TrueBites", title, children }) {
  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <header className="border-b border-sand px-4 py-5 md:px-6 xl:px-10">
        <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between">
          <Link to="/map"><TrueBitesLogo size="header" /></Link>
          <Link
            to="/map"
            className="text-xs font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:text-forest"
          >
            ← Back to Discover
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[820px] px-4 py-14 md:px-6 md:py-20">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">{eyebrow}</p>
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
