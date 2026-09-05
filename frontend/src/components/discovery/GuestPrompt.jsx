import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

// Shown whenever a guest (no session) tries to bookmark, add a stop tied to
// their account, or open "My reviews" — actions that need an identity to
// mean anything. It is portalled because a fixed overlay is sized against an
// ancestor with backdrop-filter / filter / transform rather than the viewport.
// DiscoveryHeader has backdrop-blur, so keeping this as its child would squash
// the overlay into the header band.
export default function GuestPrompt({ open, onClose }) {
  const navigate = useNavigate();
  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-ink/56 p-0 animate-backdrop-in sm:items-center sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full rounded-t-2xl bg-white px-6 pb-6 pt-7 text-center shadow-[0_20px_60px_rgba(32,42,53,0.18)] animate-modal-in sm:max-w-[360px] sm:rounded-lg"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 grid size-11 place-items-center text-muted"
        >
          <X size={18} />
        </button>

        <img
          src="/assets/mascot_mystery.png"
          alt=""
          className="mx-auto mb-2.5 h-9 w-9 object-contain drop-shadow-[0_6px_6px_rgba(32,42,53,0.25)]"
        />
        <div className="mb-5 font-display text-lg font-bold leading-snug text-forest">
          Log in for a more personalized experience.
        </div>

        <button
          onClick={() => navigate("/login")}
          className="min-h-11 w-full rounded-[10px] bg-forest px-4 text-[14.5px] font-semibold text-white"
        >
          Log In or Sign Up
        </button>
      </div>
    </div>,
    document.body,
  );
}
