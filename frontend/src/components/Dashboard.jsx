import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Info, Search, ShieldAlert } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import DiscoveryHeader from "./discovery/DiscoveryHeader";
import AdvancedFilters from "./discovery/AdvancedFilters";
import VendorCard from "./discovery/VendorCard";
import VendorCardSkeleton from "./discovery/VendorCardSkeleton";
import VendorDetailModal from "./discovery/VendorDetailModal";
import GuestPrompt from "./discovery/GuestPrompt";
import WelcomeSlideshow from "./discovery/WelcomeSlideshow";
import Footer from "./Footer";
import { pageNumbers, paginate } from "../lib/pagination";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";
import { customerSession } from "../lib/roles";
import { getAccountStatus } from "../api/engagement";
import { humanizeDuration } from "../lib/suspension";
import { hasSeenWelcome, markWelcomeSeen } from "../lib/welcomePrefs";

const PAGE_SIZE = 12;

// The map-page discovery dashboard. DiscoveryHeader (logo/search/List·Map/avatar)
// + Vendors/Bookmarks/My reviews tab strip. Vendors come from Supabase.
export default function Dashboard({
  vendors,
  filteredVendors,
  filters,
  onFilters,
  onClearFilters,
  hasLocation,
  onRequestLocation,
  loading,
  loadError,
  onRetryLoad,
  bookmarks,
  onToggleBookmark,
  onOpenMap,
  tripVendorIds,
  onAddStop,
  onVendorUpdated,
  focusVendorId,
  onFocusVendorHandled,
}) {
  const { session: authSession } = useSession();
  const session = customerSession(authSession);
  const [page, setPage] = useState(1);
  const [detailVendor, setDetailVendor] = useState(null);
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const [accountStatus, setAccountStatus] = useState(null);
  // First-visit "what is TrueBites" popup — replaces the old landing page at
  // "/". Lazy-init reads localStorage once instead of flashing the popup
  // open on every render before the effect below can close it.
  const [showWelcome, setShowWelcome] = useState(() => !hasSeenWelcome());
  const navigate = useNavigate();
  const bookmarked = vendors.filter((v) => bookmarks.has(v.id));

  function closeWelcome() {
    markWelcomeSeen();
    setShowWelcome(false);
  }

  // Checked on every visit rather than only at sign-in — a ban blocks future
  // sign-ins but doesn't revoke an already-issued session token, so a
  // suspended customer can still be sitting on a live session.
  useEffect(() => {
    if (!session) { setAccountStatus(null); return; }
    let active = true;
    getAccountStatus().then((status) => { if (active) setAccountStatus(status); }).catch(() => {});
    return () => { active = false; };
  }, [session]);

  // Guests can browse and build a browser-local trip. Account-backed actions
  // (bookmarking, suggestions, and "My reviews") still require login.
  function requireAuth(fn) {
    return (...args) => {
      if (!session && !ENGAGEMENT_TEST_MODE) { setGuestPromptOpen(true); return; }
      fn(...args);
    };
  }
  const guardedToggleBookmark = requireAuth(onToggleBookmark);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Arrived from a notification: open that vendor's detail once the list has
  // loaded, then clear the param so it doesn't reopen on refresh.
  useEffect(() => {
    if (!focusVendorId || vendors.length === 0) return;
    const match = vendors.find((v) => v.id === focusVendorId);
    if (match) setDetailVendor(match);
    onFocusVendorHandled?.();
  }, [focusVendorId, vendors, onFocusVendorHandled]);

  const meta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = meta.avatar_url || "";
  const firstName = meta.first_name || "";
  const initials = firstName
    ? (meta.first_name?.[0] || "") + (meta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");

  const pageData = paginate(filteredVendors, page, PAGE_SIZE);
  useEffect(() => {
    if (page > pageData.totalPages) setPage(pageData.totalPages);
  }, [page, pageData.totalPages]);
  const isInTrip = (id) => tripVendorIds?.has(id) ?? false;
  const changePage = (nextPage) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <DiscoveryHeader
        onOpenMap={onOpenMap}
        session={session} userEmail={userEmail} initials={initials} firstName={firstName} avatarUrl={avatarUrl} savedCount={bookmarked.length}
        onLogin={() => navigate("/login")} onOpenProfile={() => navigate("/profile")}
        activeSection="discover"
        onOpenDiscover={() => navigate("/map")}
        onSignUp={() => navigate("/login")}
        onOpenVendor={(id) => setDetailVendor(vendors.find((v) => v.id === id) || null)}
      />

      {accountStatus?.suspended && (
        <div className="mx-auto mt-4 w-full max-w-[1360px] px-4 md:px-6 xl:px-10">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
            <ShieldAlert size={16} className="shrink-0" />
            <span>
              This account has been suspended{" "}
              {accountStatus.indefinite ? "until further notice" : `for ${humanizeDuration(accountStatus.until)}`}.
            </span>
            <button
              type="button"
              onClick={() => navigate("/account-suspended")}
              className="ml-auto shrink-0 text-[13px] font-bold underline underline-offset-2 hover:text-terracotta-light"
            >
              Learn more
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1360px] px-4 pb-16 pt-8 md:px-6 md:pb-18 md:pt-12 xl:px-10">
        <>
            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-end lg:gap-12">
              <div className="flex items-center gap-4">
                <img
                  src="/assets/mascot.png"
                  alt=""
                  aria-hidden="true"
                  className="h-16 w-16 shrink-0 object-contain sm:h-20 sm:w-20"
                />
                <div>
                  <p className="mb-3 mt-0 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">
                    A local guide to Melaka
                  </p>
                  <h1 className="m-0 max-w-[760px] font-display text-[clamp(25.6px,3.2vw,43.2px)] font-medium leading-[1.05] tracking-[-0.04em] text-ink">
                    Welcome to Melaka...{" "}
                    <span className="italic text-forest">Jom MAKAN!</span>{" "}
                    <button
                      type="button"
                      onClick={() => setShowWelcome(true)}
                      aria-label="Show welcome introduction"
                      title="Show welcome introduction"
                      className="relative -top-2 inline-grid size-4 shrink-0 place-items-center align-top text-muted transition-colors hover:text-forest"
                    >
                      <Info size={14} strokeWidth={2} />
                    </button>
                  </h1>
                  <p className="mb-0 mt-3 text-sm text-muted">
                    {vendors.length} places waiting to be discovered
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="community-discoveries-cta"
                onClick={requireAuth(() => navigate("/suggestions/new"))}
                className="mesh-glass-cta group flex min-h-16 w-full items-center justify-between gap-3 rounded-full px-6 py-3 text-left text-forest transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white/50">
                    <img src="/assets/vendor.png" alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-forest/70">Community discoveries</span>
                    <span className="mt-0.5 block font-display text-lg font-semibold leading-tight">Know a place? Add it here now!</span>
                  </span>
                </span>
                <span className="hidden items-center gap-1 text-sm font-bold sm:flex">
                  <span>Share</span>
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
                </span>
                <ArrowRight size={16} aria-hidden="true" className="shrink-0 sm:hidden" />
              </button>
            </div>

            <label data-testid="discovery-search" className="relative mb-5 flex w-full items-center py-1.5">
              <Search size={18} className="absolute left-3.5 text-muted" />
              <input
                value={filters.search}
                onChange={(event) => onFilters({ search: event.target.value })}
                placeholder="Search Nasi Lemak, Jonker, Kopitiam…"
                aria-label="Search places"
                className="search-shine min-h-12 w-full rounded-full pl-11 pr-4 text-ink outline-none placeholder:text-[#8B9197]"
              />
            </label>

            <div className="mb-8">
              <AdvancedFilters
                filters={filters}
                onChange={onFilters}
                onClear={onClearFilters}
                vendors={vendors}
                resultCount={filteredVendors.length}
                hasLocation={hasLocation}
                onRequestLocation={onRequestLocation}
              />
            </div>

            <div className="mb-8 flex flex-col items-center gap-1.5">
              <span className="font-body text-2xl font-light tracking-wide text-ink">Discover</span>
              <img src="/assets/melaka-skyline.png" alt="" aria-hidden="true" className="w-44 object-contain" />
            </div>

            {loading && vendors.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => <VendorCardSkeleton key={i} />)}
              </div>
            ) : loadError && vendors.length === 0 ? (
              <LoadError message={loadError} onRetry={onRetryLoad} />
            ) : filteredVendors.length === 0 ? (
              <Empty onClear={onClearFilters} />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {pageData.items.map((v) => (
                    <VendorCard
                      key={v.id} vendor={v}
                      inTrip={isInTrip(v.id)} bookmarked={bookmarks.has(v.id)}
                      onToggleBookmark={guardedToggleBookmark} onAddStop={onAddStop}
                      onOpenDetail={setDetailVendor}
                    />
                  ))}
                </div>
                <Pagination
                  page={pageData.page}
                  totalPages={pageData.totalPages}
                  total={pageData.total}
                  onChange={changePage}
                />
              </>
            )}
        </>
      </main>

      <Footer />

      {detailVendor && (
        <VendorDetailModal
          key={detailVendor.id}
          vendor={detailVendor}
          inTrip={isInTrip(detailVendor.id)} bookmarked={bookmarks.has(detailVendor.id)}
          onToggleBookmark={guardedToggleBookmark} onAddStop={onAddStop}
          onClose={() => setDetailVendor(null)}
          onVendorUpdated={(vendorId, patch) => {
            onVendorUpdated?.(vendorId, patch);
            setDetailVendor((cur) => (cur && cur.id === vendorId ? { ...cur, ...patch } : cur));
          }}
        />
      )}

      <GuestPrompt open={guestPromptOpen} onClose={() => setGuestPromptOpen(false)} />

      {showWelcome && <WelcomeSlideshow onClose={closeWelcome} />}
    </div>
  );
}

// Distinct from Empty (a genuinely empty result) — a failed fetch used to
// fall through to the exact same "No places found / Clear filters" UI,
// which is actively misleading: there's nothing to clear, and "Try again"
// (not a filter reset) is the only action that can actually help.
function LoadError({ message, onRetry }) {
  return (
    <div className="mt-6 border border-sand bg-white px-6 py-12 text-center md:py-16">
      <h2 className="mb-2 mt-0 font-display text-2xl text-ink">Couldn't load vendors</h2>
      <p className="mb-5 mt-0 text-[13px] text-muted">{message || "Something went wrong. Check your connection and try again."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded border border-forest bg-forest px-4 text-white"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function Empty({ onClear }) {
  return (
    <div className="mt-6 border border-sand bg-white px-6 py-12 text-center md:py-16">
      <h2 className="mb-2 mt-0 font-display text-2xl text-ink">No places found</h2>
      <p className="mb-5 mt-0 text-[13px] text-muted">Try changing or clearing your filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 rounded border border-forest bg-forest px-4 text-white"
      >
        Clear filters
      </button>
    </div>
  );
}

// 44px targets at phone widths; the original compact 32px controls from md up.
const PAGE_CTL = "grid size-11 place-items-center rounded border text-xs md:size-8";
const PAGE_BTN = `${PAGE_CTL} border-transparent text-muted hover:border-sand hover:text-forest disabled:cursor-not-allowed disabled:opacity-35`;
const PAGE_NUM = `${PAGE_CTL} border-transparent text-muted hover:border-sand hover:text-forest`;
const PAGE_NUM_ACTIVE = `${PAGE_CTL} border-forest bg-forest text-white`;

function Pagination({ page, totalPages, total, onChange }) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className="mt-8 flex flex-col items-stretch gap-3 border-t border-sand pt-4.5 md:flex-row md:items-center md:justify-between"
      aria-label="Vendor pages"
    >
      <span className="text-xs text-muted">
        {total} places · Page {page} of {totalPages}
      </span>
      <div className="flex items-center justify-center gap-1 md:justify-start">
        <button
          type="button"
          className={PAGE_BTN}
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        {pageNumbers(page, totalPages).map((item, index) => item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted" aria-hidden="true">…</span>
        ) : (
          <button
            key={item}
            type="button"
            className={item === page ? PAGE_NUM_ACTIVE : PAGE_NUM}
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          className={PAGE_BTN}
          aria-label="Next page"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
