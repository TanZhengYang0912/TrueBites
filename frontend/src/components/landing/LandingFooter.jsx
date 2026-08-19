import TrueBitesLogo from "../TrueBitesLogo";

// Forest footer: TRUEBITES wordmark + official tagline + location/AI/year.
const LINKS = ["About", "Privacy", "Contact Melaka Tourism"];

export default function LandingFooter() {
  return (
    <footer className="bg-forest px-5 py-12 md:px-12 md:py-16">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8">
        {/* Top row: wordmark + nav links */}
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Wordmark */}
          <div>
            <TrueBitesLogo size="footer" tone="light" />
            <div className="mt-3.5 font-body text-xs uppercase tracking-[1.1px] text-terracotta-light">
              Official Food Discovery Platform · Melaka Tourism
            </div>
          </div>

          {/* Footer links */}
          <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
            {LINKS.map((link) => (
              <span key={link} className="cursor-pointer font-body text-xs tracking-[0.5px] text-white/50">
                {link}
              </span>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8" />

        {/* Bottom row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-body text-xs tracking-[0.3px] text-white/40">
            Melaka, Malaysia · AI-Powered · Est. 2024
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-terracotta" />
            <span className="font-body text-[11px] tracking-[0.5px] text-white/35">
              © 2024 TrueBites. Built for Melaka.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
