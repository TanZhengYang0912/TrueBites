import { useEffect, useRef, useState } from "react";
import { Bookmark, Lightbulb, LayoutGrid, Map as MapIcon, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import TrueBitesLogo from "../TrueBitesLogo";
import NotificationBell from "./NotificationBell";
import GuestPrompt from "./GuestPrompt";
import { ENGAGEMENT_TEST_MODE } from "../../lib/testMode";

// Shared customer header for discovery and map surfaces. Search lives in the
// discovery hero so the top bar stays quiet and consistent across screens.
// Below md the primary nav drops to its own scrollable row beneath the brand.
const NAV_LINK = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-semibold no-underline transition-colors motion-reduce:transition-none";
const NAV_IDLE = `${NAV_LINK} text-muted hover:text-forest`;
const NAV_ACTIVE = `${NAV_LINK} text-forest`;

const AVATAR = "grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-forest text-sm font-semibold text-white";

function HeaderAvatar({ avatarUrl, initials }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imageFailed) {
    return <img src={avatarUrl} alt="" className="size-full object-cover" onError={() => setImageFailed(true)} />;
  }
  return initials;
}

export default function DiscoveryHeader({
  session, userEmail, initials, firstName, avatarUrl, onLogin, onOpenProfile, onSignUp,
  activeSection = "discover", savedCount = 0,
  onOpenVendor,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Same condition as Dashboard.jsx's requireAuth. ENGAGEMENT_TEST_MODE is on
  // in the Playwright harness, where these links should navigate rather than
  // opening a dialog.
  function goGated(path) {
    return (event) => {
      if (!session && !ENGAGEMENT_TEST_MODE) {
        event.preventDefault();
        setGuestPromptOpen(true);
        return;
      }
      navigate(path);
    };
  }

  // Same dismissal contract as NotificationBell: outside click and Escape.
  // A menu that traps the page is worse than no menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex min-h-[72px] flex-wrap items-center gap-2 border-b border-sand bg-chalk/95 px-4 py-2 font-body backdrop-blur lg:flex-nowrap lg:gap-6 md:px-10">
      <Link
        to="/"
        aria-label="Back to TrueBites home"
        title="Back to home"
        className="flex shrink-0 items-center no-underline"
      >
        <TrueBitesLogo size="header" />
      </Link>

      <nav
        className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto lg:order-none lg:w-auto lg:overflow-visible"
        aria-label="Primary navigation"
      >
        <Link
          to="/discover"
          className={activeSection === "discover" ? NAV_ACTIVE : NAV_IDLE}
          aria-current={activeSection === "discover" ? "page" : undefined}
        >
          <LayoutGrid size={14} strokeWidth={1.7} />
          <span>Discover</span>
        </Link>
        <Link
          to="/map"
          className={activeSection === "map" ? NAV_ACTIVE : NAV_IDLE}
          aria-current={activeSection === "map" ? "page" : undefined}
        >
          <MapIcon size={14} strokeWidth={1.7} />
          <span>Map</span>
        </Link>
        <Link
          to="/saved"
          onClick={goGated("/saved")}
          className={activeSection === "saved" ? NAV_ACTIVE : NAV_IDLE}
          aria-current={activeSection === "saved" ? "page" : undefined}
        >
          <Bookmark size={14} strokeWidth={1.7} />
          <span>Saved</span>
          {savedCount > 0 && (
            <span className="rounded-full bg-forest px-1.5 text-[10px] font-bold text-white">{savedCount}</span>
          )}
        </Link>
        <Link
          to="/reviews"
          onClick={goGated("/reviews")}
          className={activeSection === "reviews" ? NAV_ACTIVE : NAV_IDLE}
          aria-current={activeSection === "reviews" ? "page" : undefined}
        >
          My reviews
        </Link>
        <Link
          to="/suggestions"
          onClick={goGated("/suggestions")}
          className={activeSection === "suggestions" ? NAV_ACTIVE : NAV_IDLE}
          aria-current={activeSection === "suggestions" ? "page" : undefined}
        >
          <Lightbulb size={14} strokeWidth={1.8} />
          <span>Suggest</span>
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {session ? (
          <>
            <NotificationBell onOpenVendor={onOpenVendor} />
            <button
              type="button"
              className={AVATAR}
              onClick={onOpenProfile}
              title={userEmail}
              aria-label={`Open profile${firstName ? ` for ${firstName}` : ""}`}
            >
              <HeaderAvatar avatarUrl={avatarUrl} initials={initials} />
            </button>
          </>
        ) : (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-sand text-forest"
            >
              <UserRound size={16} />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Account"
                className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-xl border border-sand bg-white shadow-[0_10px_34px_rgba(64,84,74,0.22)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={onLogin}
                  className="flex min-h-11 w-full items-center px-3 text-left text-[13px] font-semibold text-forest hover:bg-chalk"
                >
                  Log In
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={onSignUp}
                  className="flex min-h-11 w-full items-center border-t border-sand px-3 text-left text-[13px] font-semibold text-forest hover:bg-chalk"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <GuestPrompt open={guestPromptOpen} onClose={() => setGuestPromptOpen(false)} />
    </header>
  );
}
