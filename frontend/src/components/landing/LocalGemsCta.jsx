import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// "DISCOVER LOCAL GEMS / Find what the locals eat." CTA section.
// Clean chalk section with centred editorial type and a forest pill CTA.
export default function LocalGemsCta() {
  return (
    <section className="bg-chalk px-5 py-16 text-center md:px-12 md:py-30">
      {/* Eyebrow */}
      <div className="mb-5 inline-flex items-center gap-3.5 font-body text-[11px] font-semibold uppercase tracking-[3.5px] text-terracotta">
        <span className="block h-px w-5 bg-terracotta md:w-7" />
        Discover Local Gems
        <span className="block h-px w-5 bg-terracotta md:w-7" />
      </div>

      {/* Headline */}
      <h2 className="mb-5 font-display text-[clamp(30px,5vw,60px)] font-bold leading-[1.15] text-forest">
        Find what the locals eat.
      </h2>

      {/* Subtitle */}
      <p className="mx-auto mb-11 max-w-[540px] font-body text-[17px] leading-[1.7] text-muted">
        AI-extracted recommendations from the TikTok creators who actually live
        here. No algorithms. No sponsored listings. Just the real Melaka.
      </p>

      {/* CTA — hover handled in CSS rather than inline mouse handlers.
          Inline on desktop; on mobile it's hidden here and rendered as a
          fixed bottom bar instead, so it doesn't get buried at page-end. */}
      <Link
        to="/discover"
        className="hidden min-h-11 items-center gap-2.5 rounded-[32px] bg-forest px-9 py-4 font-body text-[13.5px] font-semibold uppercase tracking-[1.2px] text-white no-underline shadow-[0_4px_20px_rgba(64,84,74,0.25)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(64,84,74,0.32)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 md:inline-flex"
      >
        Plan Visit <ArrowRight size={16} />
      </Link>

      {/* Floating mobile CTA — fixed to the bottom of the viewport */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-chalk via-chalk/90 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-8 md:hidden">
        <Link
          to="/discover"
          className="inline-flex min-h-11 w-full max-w-sm items-center justify-center gap-2.5 rounded-[32px] bg-forest px-9 py-4 font-body text-[13.5px] font-semibold uppercase tracking-[1.2px] text-white no-underline shadow-[0_4px_20px_rgba(64,84,74,0.35)] transition-[transform,box-shadow] duration-150 active:translate-y-0.5 motion-reduce:transition-none"
        >
          Plan Visit <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
