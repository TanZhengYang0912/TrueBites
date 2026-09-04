import { Link } from "react-router-dom";

const LINKS = [
  { label: "About Us", to: "/about" },
  { label: "Terms and Conditions", to: "/terms" },
  { label: "Rules and Guidelines", to: "/guidelines" },
  { label: "Contact Us", to: "/contact" },
  { label: "Careers", to: "/careers" },
];

// Shared footer for the discovery app's scrolling pages (Dashboard,
// Engagement, Profile, Login).
export default function Footer() {
  return (
    <footer className="bg-forest px-4 py-12 md:px-6 md:py-16 xl:px-10">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <img src="/assets/truebites-logo-footer.jpg" alt="TrueBites" className="h-11 w-auto object-contain" />
            <div className="mt-3.5 font-body text-xs uppercase tracking-[1.1px] text-terracotta-light">
              Official Food Discovery Platform · Melaka Tourism
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-x-9 gap-y-3" aria-label="Footer">
            {LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="font-body text-xs tracking-[0.5px] text-white/50 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="h-px bg-white/8" />

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
