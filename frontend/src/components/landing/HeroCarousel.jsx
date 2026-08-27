import { useState, useEffect, useRef, useCallback } from "react";
import { HERO_SLIDES } from "../../lib/landingImages";

// 4-slide full-bleed hero carousel.
// - Giant "MELAKA" Playfair wordmark (always visible)
// - Per-slide: terracotta eyebrow caption + short description
// - Persistent "600 Years of Culture, Heritage & Flavour" italic tagline
// - "SCROLL TO EXPLORE" label + "01/4" counter + dot pagination
// - Auto-advance every 3.5 s; dots are manual override
// - Crossfade transition; respects prefers-reduced-motion
//
// Uses dvh rather than vh so mobile browser chrome cannot clip the bottom row.
export default function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef(null);
  const reducedMotion = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  const goTo = useCallback((idx) => {
    if (idx === current) return;
    if (!reducedMotion) {
      setFading(true);
      setTimeout(() => {
        setCurrent(idx);
        setFading(false);
      }, 400);
    } else {
      setCurrent(idx);
    }
  }, [current, reducedMotion]);

  // Auto-advance
  useEffect(() => {
    timerRef.current = setInterval(() => {
      goTo((current + 1) % HERO_SLIDES.length);
    }, 3500);
    return () => clearInterval(timerRef.current);
  }, [current, goTo]);

  const slide = HERO_SLIDES[current];
  const fade = fading ? "opacity-0" : "opacity-100";

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-ink">
      {/* Background image */}
      <div className={`absolute inset-0 transition-opacity duration-400 ease-in-out motion-reduce:transition-none ${fade}`}>
        <img
          key={slide.id}
          src={slide.url}
          alt={slide.alt}
          className="block size-full object-cover"
        />
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35)_0%,transparent_40%,rgba(32,42,53,0.7)_100%)]" />
      </div>

      {/* Giant MELAKA wordmark — centred */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none font-display text-[clamp(48px,14vw,160px)] font-extrabold leading-none tracking-[0.12em] text-white/8">
          MELAKA
        </span>
      </div>

      {/* Slide caption */}
      <div className={`absolute left-5 top-1/2 max-w-[480px] -translate-y-1/2 pr-5 transition-opacity duration-400 ease-in-out motion-reduce:transition-none md:left-12 md:pr-0 ${fade}`}>
        <div className="mb-3 font-body text-xs font-semibold uppercase tracking-[2.5px] text-terracotta">
          {slide.eyebrow}
        </div>
        <div className="font-display text-[clamp(22px,3.5vw,36px)] font-semibold leading-tight text-white">
          {slide.caption}
        </div>
      </div>

      {/* Bottom bar — stacked on phones so the tagline and dots never collide */}
      <div className="absolute inset-x-5 bottom-6 flex flex-col gap-5 md:inset-x-12 md:bottom-15 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-5 font-display text-[clamp(16px,2vw,22px)] italic leading-snug text-white/85">
            600 Years of Culture, Heritage &amp; Flavour
          </div>
          <div className="font-body text-[10.5px] uppercase tracking-[3px] text-white/55">
            ↓ SCROLL TO EXPLORE
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end md:gap-3.5">
          {/* Counter */}
          <div className="font-body text-xs tracking-[1px] text-white/70">
            <span className="text-base font-bold text-white">{String(current + 1).padStart(2, "0")}</span>
            <span className="mx-[5px]">/</span>
            {String(HERO_SLIDES.length).padStart(2, "0")}
          </div>
          {/* Dots — 44px hit areas around small visual bars */}
          <div className="-ml-2 flex md:-mr-2 md:ml-0">
            {HERO_SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => { clearInterval(timerRef.current); goTo(i); }}
                aria-label={`Slide ${i + 1}`}
                aria-current={i === current}
                className="grid size-11 place-items-center"
              >
                <span
                  className={i === current
                    ? "block h-2 w-7 rounded-full bg-terracotta transition-all duration-300 motion-reduce:transition-none"
                    : "block h-2 w-2 rounded-full bg-white/40 transition-all duration-300 motion-reduce:transition-none"}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
