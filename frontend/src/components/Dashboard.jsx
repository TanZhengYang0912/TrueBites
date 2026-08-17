import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import DiscoveryHeader from "./discovery/DiscoveryHeader";
import FilterChips from "./discovery/FilterChips";
import VendorCard from "./discovery/VendorCard";
import VendorCardSkeleton from "./discovery/VendorCardSkeleton";
import VendorDetailModal from "./discovery/VendorDetailModal";
import GuestPrompt from "./discovery/GuestPrompt";
import { categoryMatches, creatorHandle } from "../lib/vendorDisplay";
import { pageNumbers, paginate } from "../lib/pagination";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";
import { customerSession } from "../lib/roles";

const PAGE_SIZE = 12;

// The map-page discovery dashboard. DiscoveryHeader (logo/search/List·Map/avatar)
// + Vendors/Bookmarks/My reviews tab strip. Vendors come from Supabase.
export default function Dashboard({ vendors, loading, bookmarks, onToggleBookmark, onOpenMap, tripVendorIds, onAddStop }) {
  const { session: authSession } = useSession();
  const session = customerSession(authSession);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [creator, setCreator] = useState("all");
  const [page, setPage] = useState(1);
  const [detailVendor, setDetailVendor] = useState(null);
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const navigate = useNavigate();
  const bookmarked = vendors.filter((v) => bookmarks.has(v.id));

  // Guests can browse freely but can't bookmark, add personal trip stops
  // tied to an account, or view "My reviews" — nudge them to log in instead.
  function requireAuth(fn) {
    return (...args) => {
      if (!session && !ENGAGEMENT_TEST_MODE) { setGuestPromptOpen(true); return; }
      fn(...args);
    };
  }
  const guardedToggleBookmark = requireAuth(onToggleBookmark);

  useEffect(() => {
    setPage(1);
  }, [search, category, creator]);

  const meta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = meta.avatar_url || "";
  const firstName = meta.first_name || "";
  const initials = firstName
    ? (meta.first_name?.[0] || "") + (meta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");

  function matchesSearch(v) {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return v.name?.toLowerCase().includes(q)
      || (v.cuisine_types || "").toLowerCase().includes(q)
      || (v.signature_dishes || "").toLowerCase().includes(q);
  }
  function matchesCategory(v) {
    return categoryMatches(v, category);
  }
  function matchesCreator(v) {
    return creator === "all" || creatorHandle(v) === creator;
  }

  const displayed = vendors.filter((v) => matchesSearch(v) && matchesCategory(v) && matchesCreator(v));
  const pageData = paginate(displayed, page, PAGE_SIZE);
  useEffect(() => {
    if (page > pageData.totalPages) setPage(pageData.totalPages);
  }, [page, pageData.totalPages]);
  const isInTrip = (id) => tripVendorIds?.has(id) ?? false;

  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <DiscoveryHeader
        onOpenMap={onOpenMap}
        session={session} userEmail={userEmail} initials={initials} firstName={firstName} avatarUrl={avatarUrl} savedCount={bookmarked.length}
        onLogin={() => navigate("/login")} onOpenProfile={() => navigate("/profile")}
        activeSection="discover"
        onOpenDiscover={() => navigate("/map")}
        onOpenSaved={requireAuth(() => navigate("/engagement"))}
        onOpenReviews={requireAuth(() => navigate("/engagement?tab=reviews"))}
        onSignUp={() => navigate("/login")}
      />

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
                  <h1 className="m-0 max-w-[760px] font-display text-[clamp(32px,4vw,54px)] font-medium leading-[1.05] tracking-[-0.04em] text-ink">
                    Hidden gems,{" "}
                    <span className="italic text-forest">authentic flavours</span>
                  </h1>
                  <p className="mb-0 mt-3 text-sm text-muted">
                    {vendors.length} places waiting to be discovered
                  </p>
                </div>
              </div>
              <label className="relative flex items-center">
                <Search size={18} className="absolute left-3.5 text-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search Nasi Lemak, Jonker, Kopitiam…"
                  aria-label="Search places"
                  className="min-h-12 w-full rounded border border-sand bg-white pl-11 pr-4 text-ink outline-none placeholder:text-[#8B9197] focus:border-forest focus:shadow-[0_0_0_3px_rgba(64,84,74,0.1)]"
                />
              </label>
            </div>

            <div className="mb-6">
              <FilterChips
                active={category}
                onSelect={setCategory}
                creator={creator}
                onCreatorSelect={setCreator}
                vendors={vendors}
              />
            </div>

            {loading && vendors.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => <VendorCardSkeleton key={i} />)}
              </div>
            ) : displayed.length === 0 ? (
              <Empty onClear={() => { setSearch(""); setCategory("all"); setCreator("all"); }} />
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
                  onChange={setPage}
                />
              </>
            )}
        </>
      </main>

      {detailVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          inTrip={isInTrip(detailVendor.id)} bookmarked={bookmarks.has(detailVendor.id)}
          onToggleBookmark={guardedToggleBookmark} onAddStop={onAddStop}
          onClose={() => setDetailVendor(null)}
        />
      )}

      <GuestPrompt open={guestPromptOpen} onClose={() => setGuestPromptOpen(false)} />
    </div>
  );
}

function Empty({ onClear }) {
  return (
    <div className="mt-6 border border-sand bg-white px-6 py-12 text-center md:py-16">
      <h2 className="mb-2 mt-0 font-display text-2xl text-ink">No places found</h2>
      <p className="mb-5 mt-0 text-[13px] text-muted">Try a different category, creator, or search term.</p>
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
