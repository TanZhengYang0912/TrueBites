import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// Same Wikimedia Commons convention as lib/categoryPhotos.js — every image
// is sourced to match its caption rather than generic stock travel photos.
const COMMONS_FILE = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const commonsImage = (fileName, width) => `${COMMONS_FILE}${encodeURIComponent(fileName)}?width=${width}`;

// The three-slide "what is TrueBites" pitch that used to be the whole
// editorial landing page at "/". Content condensed from the old
// HeroCarousel / HeritageSection / LocalGemsCta copy.
const SLIDES = [
  {
    id: "welcome",
    image: commonsImage("CHRIST CHURCH MELAKA.jpg", 900),
    alt: "Christ Church Melaka and the red Dutch Square in the historic centre",
    eyebrow: "A Local Guide to Melaka",
    title: "600 years of culture, heritage & flavour",
    body: "Melaka's cuisine is a living archive — a flavour record written by Malay sultans, Dutch traders, Portuguese explorers, and the Peranakan Baba-Nyonya community who wove them all together.",
  },
  {
    id: "heritage",
    image: commonsImage("Melaka, Malaysia - Restoran Nyonya Ole Sayang.jpg", 900),
    alt: "Restoran Nyonya Ole Sayang, a traditional Peranakan restaurant in Melaka",
    eyebrow: "Heritage & Culture",
    title: "Where six centuries of history meet on a single plate",
    body: "TrueBites maps those stories — surfacing the hawker stalls, the century-old kopitiam, and the Nyonya kitchens that tourists walk past every day without knowing the legend hiding behind the door.",
  },
  {
    id: "local-gems",
    image: commonsImage("Jonker Walk.JPG", 900),
    alt: "Jonker Walk night market in Melaka with its illuminated heritage arch",
    eyebrow: "Discover Local Gems",
    title: "Find what the locals eat",
    body: "AI-extracted recommendations from the TikTok creators who actually live here. No algorithms. No sponsored listings. Just the real Melaka.",
  },
];

// First-visit popup on the Discover page — replaces the old editorial landing
// page at "/". Three slides, dot pagination, swipe on touch devices, tap-zones
// over the left/right half of the image, and arrow buttons for anyone using a
// mouse. The last slide's "Plan a visit" button just closes the popup — the
// user is already on the Discover page, there's nowhere else to send them.
export default function WelcomeSlideshow({ onClose }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);
  const last = index === SLIDES.length - 1;

  function go(delta) {
    setIndex((current) => Math.min(SLIDES.length - 1, Math.max(0, current + delta)));
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTouchStart(event) {
    touchStartX.current = event.touches[0].clientX;
  }
  function onTouchEnd(event) {
    if (touchStartX.current == null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
  }

  const slide = SLIDES[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to TrueBites"
      onClick={onClose}
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-forest/70 p-4 animate-backdrop-in"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative w-full max-w-[420px] overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_rgba(32,42,53,0.35)] animate-modal-in"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm"
        >
          <X size={16} />
        </button>

        <div className="relative h-56 w-full">
          <img key={slide.id} src={slide.image} alt={slide.alt} className="size-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.45)_0%,transparent_45%)]" />

          {/* Tap zones — left half goes back, right half goes forward. */}
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute inset-y-0 left-0 flex w-1/2 items-center justify-start pl-2"
            >
              <span className="grid size-9 place-items-center rounded-full bg-white/85 text-forest shadow">
                <ChevronLeft size={18} />
              </span>
            </button>
          )}
          {!last && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-end pr-2"
            >
              <span className="grid size-9 place-items-center rounded-full bg-white/85 text-forest shadow">
                <ChevronRight size={18} />
              </span>
            </button>
          )}
        </div>

        <div className="p-6 text-center">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[2px] text-terracotta">
            {slide.eyebrow}
          </div>
          <h3 className="mb-3 font-display text-xl font-semibold leading-snug text-forest">
            {slide.title}
          </h3>
          <p className="mb-5 text-sm leading-relaxed text-muted">
            {slide.body}
          </p>

          <div className="mb-5 flex items-center justify-center gap-1.5" aria-hidden="true">
            {SLIDES.map((s, i) => (
              <span
                key={s.id}
                className={i === index ? "h-2 w-6 rounded-full bg-forest transition-all" : "h-2 w-2 rounded-full bg-sand transition-all"}
              />
            ))}
          </div>

          {last ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 w-full rounded-full bg-forest px-6 text-sm font-semibold text-white transition-colors hover:bg-forest-light"
            >
              Plan a visit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(1)}
              className="min-h-11 w-full rounded-full border border-sand px-6 text-sm font-semibold text-forest transition-colors hover:border-forest"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
