import { useEffect, useState } from "react";
import { Bookmark, Lightbulb, LayoutGrid, Map as MapIcon, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import TrueBitesLogo from "../TrueBitesLogo";
import NotificationBell from "./NotificationBell";

// Shared customer header for discovery and map surfaces. Search lives in the
// discovery hero so the top bar stays quiet and consistent across screens.
// Below md the primary nav drops to its own scrollable row beneath the brand.
const NAV_LINK = "relative inline-flex min-h-11 min-w-11 justify-center items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition-colors motion-reduce:transition-none";
const NAV_IDLE = `${NAV_LINK} text-muted hover:bg-forest/6 hover:text-forest`;
const NAV_ACTIVE = `${NAV_LINK} bg-forest/8 text-forest`;

const TOGGLE = "inline-flex min-h-11 min-w-11 justify-center items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold";
const TOGGLE_ACTIVE = `${TOGGLE} bg-white text-forest shadow-sm`;
const TOGGLE_IDLE = `${TOGGLE} text-muted`;

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
  onOpenMap,
  session, userEmail, initials, firstName, avatarUrl, onLogin, onOpenProfile, onSignUp,
  onOpenSaved, onOpenReviews, onOpenDiscover, activeSection = "discover",
  onOpenSuggestions, savedCount = 0,
  mapActive = false,
  onOpenVendor,
}) {
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
        <button
          type="button"
          className={activeSection === "discover" ? NAV_ACTIVE : NAV_IDLE}
          onClick={() => onOpenDiscover?.()}
          aria-current={activeSection === "discover" ? "page" : undefined}
        >
          Discover
        </button>
        <button
          type="button"
          className={activeSection === "saved" ? NAV_ACTIVE : NAV_IDLE}
          onClick={() => onOpenSaved?.()}
          aria-current={activeSection === "saved" ? "page" : undefined}
        >
          <Bookmark size={14} strokeWidth={1.7} />
          <span>Saved</span>
          {savedCount > 0 && (
            <span className="rounded-full bg-forest px-1.5 text-[10px] font-bold text-white">{savedCount}</span>
          )}
        </button>
        <button
          type="button"
          className={activeSection === "reviews" ? NAV_ACTIVE : NAV_IDLE}
          onClick={() => onOpenReviews?.()}
          aria-current={activeSection === "reviews" ? "page" : undefined}
        >
          My reviews
        </button>
        <button
          type="button"
          className={activeSection === "suggestions" ? NAV_ACTIVE : NAV_IDLE}
          onClick={() => onOpenSuggestions?.()}
          aria-current={activeSection === "suggestions" ? "page" : undefined}
        >
          <Lightbulb size={14} strokeWidth={1.8} />
          <span>Suggest</span>
        </button>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center rounded-lg bg-sand/40 p-0.5" aria-label="View mode">
          {mapActive ? (
            <>
              <button type="button" className={TOGGLE_IDLE} onClick={onOpenDiscover}>
                <LayoutGrid size={14} /> <span className="hidden sm:inline">List</span>
              </button>
              <span className={TOGGLE_ACTIVE}><MapIcon size={14} /> <span className="hidden sm:inline">Map</span></span>
            </>
          ) : (
            <>
              <span className={TOGGLE_ACTIVE}><LayoutGrid size={14} /> <span className="hidden sm:inline">List</span></span>
              <button type="button" className={TOGGLE_IDLE} onClick={onOpenMap}>
                <MapIcon size={14} /> <span className="hidden sm:inline">Map</span>
              </button>
            </>
          )}
        </div>

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSignUp}
              className="inline-flex min-h-11 items-center rounded-md border border-forest px-3 text-[13px] font-semibold text-forest"
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-sand text-forest"
              aria-label="Open sign in"
            >
              <UserRound size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
