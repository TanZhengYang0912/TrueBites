import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PhotoUnavailablePlaceholder from "./PhotoUnavailablePlaceholder";

// Shared image carousel behind both surfaces that show vendor photos:
//   - VendorCard: hover-to-play, no arrows/dots (`active` = pointer is over
//     the card), resets to the cover photo the moment the pointer leaves.
//   - VendorDetailModal: autoplay from the moment it opens, with arrows and
//     dots so a visitor can also step through photos manually.
// Fills its parent's `relative` container (absolute inset-0) — the parent
// keeps every overlay (category badge, bookmark/close buttons, name,
// gradient) stacked above it via z-index, unaffected by which photo is
// showing. Auto-swipes right-to-left between frames (advancing enters the
// next photo from the right edge, pushing the current one out to the left —
// the standard "swipe left to advance" motion); respects
// prefers-reduced-motion by skipping both the slide and the auto-advance timer.
export default function VendorGallery({
  images,
  alt,
  active = true,
  interval = 1400,
  resetOnInactive = false,
  showDots = false,
  showArrows = false,
  // Where `object-fit: cover` anchors the crop. Every vendor photo is a
  // portrait video frame (9:16 or 3:4) shown in a landscape box, so most of
  // the height is discarded — callers bias this upward to keep the shopfront
  // signage instead of the centre band, which is where TikTok creators burn
  // in their caption text. Defaults to the browser's own centre crop.
  objectPosition = "50% 50%",
  // Touch devices have no hover, so VendorCard opts into this: a tap on the
  // image advances to the next photo instead of bubbling to the parent's
  // onClick (which normally opens the detail view). Only kicks in when the
  // device genuinely lacks a hover-capable pointer (matchMedia, not touch
  // event support — a laptop with a touchscreen still has a mouse) and there
  // is more than one photo to cycle through; otherwise the tap passes through
  // untouched, so the vendor stays reachable exactly as before.
  tapToAdvance = false,
  className = "",
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;
  const canHover = useRef(
    typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches
  ).current;

  const goTo = useCallback((i) => setIndex(((i % count) + count) % count), [count]);
  const cyclesOnTap = tapToAdvance && !canHover && count > 1;

  const handleContainerClick = (e) => {
    if (!cyclesOnTap) return;
    e.stopPropagation();
    goTo(index + 1);
  };

  // Auto-advance while active.
  useEffect(() => {
    if (!active || count <= 1 || reducedMotion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), interval);
    return () => clearInterval(timer);
  }, [active, count, interval, reducedMotion]);

  // Snap back to the cover photo once the carousel goes inactive (card
  // hover-out). The detail modal never sets this, so it stays wherever the
  // visitor left it for the rest of that view.
  useEffect(() => {
    if (!active && resetOnInactive) setIndex(0);
  }, [active, resetOnInactive]);

  return (
    <div className={`relative size-full overflow-hidden ${className}`} onClick={handleContainerClick}>
      <div
        className="flex size-full transition-transform duration-500 ease-in-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((src, i) => {
          const description = typeof alt === "function" ? alt(src, i) : (i === 0 ? alt : `${alt} — photo ${i + 1} of ${count}`);
          return (
            <div key={src || `empty-${i}`} className="h-full w-full shrink-0 grow-0 basis-full">
              {src ? (
                <img
                  src={src}
                  alt={description}
                  loading="lazy"
                  className="block size-full object-cover"
                  style={{ objectPosition }}
                />
              ) : (
                <PhotoUnavailablePlaceholder />
              )}
            </div>
          );
        })}
      </div>

      {/* Non-interactive — a touch user has no hover preview, so this tells
          them there's more than one photo and roughly where they are, without
          adding another small tap target (see cyclesOnTap above for the
          actual interaction: tapping the photo itself advances it). */}
      {cyclesOnTap && (
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-ink/50 px-2 py-0.5 text-[10px] font-semibold text-white">
          {index + 1} / {count}
        </span>
      )}

      {showArrows && count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goTo(index - 1); }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-ink/40 text-white transition-colors hover:bg-ink/60 motion-reduce:transition-none"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goTo(index + 1); }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-ink/40 text-white transition-colors hover:bg-ink/60 motion-reduce:transition-none"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {showDots && count > 1 && (
        <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === index}
              className="grid size-5 place-items-center"
            >
              <span
                className={i === index
                  ? "block h-1.5 w-4 rounded-full bg-white transition-all duration-300 motion-reduce:transition-none"
                  : "block h-1.5 w-1.5 rounded-full bg-white/50 transition-all duration-300 motion-reduce:transition-none"}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
