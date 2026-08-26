import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Click-to-enlarge viewer for review photo thumbnails — src=null renders nothing.
// Rendered via a portal straight into <body>: callers like VendorDetailModal
// animate their own card with a CSS transform (animate-modal-in), and a
// `transform` on ANY ancestor turns it into the containing block for
// `position: fixed` descendants per the CSS spec — without the portal, this
// lightbox would be "fixed" relative to that card instead of the real
// viewport, showing up scrolled/offset inside the modal instead of as a true
// full-screen popup.
export default function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  if (!src) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-forest/60 p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[420px] rounded-2xl bg-white p-3 shadow-[0_20px_60px_rgba(64,84,74,0.35)]"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-3 -top-3 grid size-9 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(64,84,74,0.25)]"
        >
          <X size={16} color="#405c4a" />
        </button>
        <img
          src={src}
          alt="Review attachment enlarged"
          className="max-h-[60vh] w-full rounded-xl object-contain"
        />
      </div>
    </div>,
    document.body
  );
}
