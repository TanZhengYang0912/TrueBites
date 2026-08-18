import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Heart, Trash2, FolderInput, Plus, Search, Star, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Check } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import {
  getBookmarks, getFolders, addBookmark, removeBookmark, moveBookmark, createFolder, deleteFolder,
  getMyReviews,
} from "../api/engagement";
import Toast from "../components/engagement/Toast";
import DiscoveryHeader from "../components/discovery/DiscoveryHeader";
import { useToast, sleep } from "../lib/useToast";
import VendorCard from "../components/discovery/VendorCard";
import { customerSession } from "../lib/roles";
import VendorDetailModal from "../components/discovery/VendorDetailModal";
import FolderPickerModal from "../components/engagement/FolderPickerModal";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";

const TERRACOTTA = "#A35D47";
const MUTED = "#69717A";
const PAGE_SIZE = 6;
// Cards in the same grid row can have different natural heights (e.g. the star-rating
// line only renders for vendors with reviews). The grid already stretches each row's
// wrapper divs to match the tallest one — this just lets VendorCard's <article> grow
// into that stretched height too, without forcing its own internals into a flex layout
// (that previously fought with the photo's aspect-ratio box and blew it up to full size).
const CARD_STRETCH = "[&>article]:flex-1";
// Fuses the (shared, untouched) VendorCard with a page-specific footer strip
// below it — squares off the card's bottom edge and cancels its hover-lift so
// the footer reads as part of one card instead of a stray line floating under it.
const CARD_MERGE_FOOTER = "[&>article]:rounded-b-none [&>article]:border-b-0 [&>article]:hover:translate-y-0";
// Fixed height (not padding-driven) so every footer in a row is identical
// regardless of content — a long folder name or review date must never make
// one card taller than its neighbours the way the main discovery grid never does.
const CARD_FOOTER = "flex h-11 shrink-0 items-center gap-1.5 overflow-hidden rounded-b border border-t-0 border-sand bg-chalk px-3 text-[11px] text-muted";

export default function EngagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);
  const [tab, setTab] = useState(searchParams.get("tab") === "reviews" ? "reviews" : "bookmarks");

  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [bookmarkPage, setBookmarkPage] = useState(1);

  const [reviews, setReviews] = useState([]);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewRating, setReviewRating] = useState("all");
  const [reviewSort, setReviewSort] = useState("newest");
  const [reviewPage, setReviewPage] = useState(1);
  const [detailVendor, setDetailVendor] = useState(null);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null); // vendor awaiting a folder pick
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState(null); // folder awaiting delete confirmation
  const [pendingUnbookmarkVendor, setPendingUnbookmarkVendor] = useState(null); // vendor awaiting unbookmark confirmation
  const [toast, notify] = useToast();
  const bookmarkedVendorIds = new Set(bookmarks.map((b) => b.vendor_id));

  useEffect(() => {
    if (!session && !ENGAGEMENT_TEST_MODE) return;
    refreshBookmarks();
    refreshReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => { setBookmarkPage(1); }, [activeFolder]);
  useEffect(() => { setReviewPage(1); }, [reviewSearch, reviewRating, reviewSort]);

  function refreshBookmarks() {
    getFolders().then((f) => setFolders(f.folders)).catch((e) => { console.error(e.message); notify("Couldn't load your folders.", true); });
    getBookmarks().then((b) => setBookmarks(b.bookmarks)).catch((e) => { console.error(e.message); notify("Couldn't load your bookmarks.", true); });
  }
  function refreshReviews() {
    getMyReviews().then((r) => setReviews(r.reviews)).catch((e) => { console.error(e.message); notify("Couldn't load your reviews.", true); });
  }

  if (sessionLoading) return null;

  if (!session && !ENGAGEMENT_TEST_MODE) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-chalk px-4 font-body">
        <div className="w-full max-w-[420px] rounded-2xl border border-sand bg-white px-6 py-10 text-center">
          <Heart size={28} color={TERRACOTTA} className="mx-auto mb-2.5" />
          <h2 className="mb-2 mt-0 font-display text-xl text-forest">Sign in to see your bookmarks &amp; reviews</h2>
          <button
            onClick={() => navigate("/login")}
            className="mt-2 min-h-11 w-full rounded-[10px] bg-forest px-5 text-sm font-semibold text-white"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const visibleBookmarks = (activeFolder === "all"
    ? bookmarks
    : bookmarks.filter((b) => b.folder_id === activeFolder)
  ).filter((b) => b.vendor);
  const bookmarkPageCount = Math.max(1, Math.ceil(visibleBookmarks.length / PAGE_SIZE));
  const pagedBookmarks = visibleBookmarks.slice((bookmarkPage - 1) * PAGE_SIZE, bookmarkPage * PAGE_SIZE);

  const myReviews = reviews.filter((r) => r.vendor);
  const visibleReviews = myReviews
    .filter((r) => reviewRating === "all" || r.rating === Number(reviewRating))
    .filter((r) => {
      const q = reviewSearch.trim().toLowerCase();
      if (!q) return true;
      return r.vendor.name?.toLowerCase().includes(q) || r.body?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (reviewSort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (reviewSort === "highest") return b.rating - a.rating;
      if (reviewSort === "lowest") return a.rating - b.rating;
      return new Date(b.created_at) - new Date(a.created_at); // newest
    });
  const reviewPageCount = Math.max(1, Math.ceil(visibleReviews.length / PAGE_SIZE));
  const pagedReviews = visibleReviews.slice((reviewPage - 1) * PAGE_SIZE, reviewPage * PAGE_SIZE);
  const meta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = meta.avatar_url || "";
  const firstName = meta.first_name || "";
  const initials = firstName
    ? (meta.first_name?.[0] || "") + (meta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");

  function handleCancelCreateFolder() {
    setNewFolderName("");
    setCreatingFolder(false);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) { notify("Folder name is required.", true); return; }
    const exists = folders.some((f) => f.name.toLowerCase() === name.toLowerCase());
    if (exists) { notify("A folder with this name already exists.", true); return; }
    try {
      await createFolder(name);
      setNewFolderName("");
      setCreatingFolder(false);
      refreshBookmarks();
      notify("Folder created successfully!");
    } catch (e) { notify(e.message, true); }
  }

  async function handleDeleteFolder(id) {
    try {
      await deleteFolder(id);
      if (activeFolder === id) setActiveFolder("all");
      refreshBookmarks();
    } catch (e) { notify(e.message, true); }
  }

  async function handleRemoveBookmark(vendorId) {
    try {
      await removeBookmark(vendorId);
      refreshBookmarks();
      notify("Vendor removed from wishlist.");
    } catch (e) { notify(e.message, true); }
  }

  async function handleMoveBookmark(vendorId, folderId) {
    try {
      await moveBookmark(vendorId, folderId);
      refreshBookmarks();
    } catch (e) { notify(e.message, true); }
  }

  // The vendor-detail modal is reachable from both the Bookmarks tab (always
  // bookmarked) and the Reviews tab (may or may not be) — so the heart there
  // needs to actually branch, unlike the plain "remove" hearts on the bookmark grid.
  function toggleBookmarkFromDetail(vendorId) {
    if (bookmarkedVendorIds.has(vendorId)) { setPendingUnbookmarkVendor(detailVendor); return; }
    setPendingSaveVendor(detailVendor);
  }

  // Heart toggle for a vendor card outside the bookmark grid (e.g. the Reviews
  // tab), where the vendor may or may not already be bookmarked.
  function toggleBookmarkForVendor(vendor) {
    if (bookmarkedVendorIds.has(vendor.id)) { setPendingUnbookmarkVendor(vendor); return; }
    setPendingSaveVendor(vendor);
  }

  async function confirmUnbookmark() {
    const vendorId = pendingUnbookmarkVendor.id;
    setPendingUnbookmarkVendor(null);
    await handleRemoveBookmark(vendorId);
  }

  async function confirmSaveBookmark(folderId) {
    await addBookmark(pendingSaveVendor.id, folderId);
    setPendingSaveVendor(null);
    refreshBookmarks();
    notify("Vendor bookmarked!");
  }

  async function createFolderAndSave(name) {
    const { folder } = await createFolder(name);
    notify("Folder created successfully!");
    refreshBookmarks();
    await sleep(1200);
    await confirmSaveBookmark(folder.id);
  }

  // Reviews are submitted from the vendor-detail modal, whose vendor object
  // is a nested copy embedded per-row in `bookmarks`/`reviews` (and possibly
  // duplicated again in `detailVendor`) — patch every copy so the card grid
  // reflects the new rating/count without a full refetch.
  function patchVendorStats(vendorId, patch) {
    setBookmarks((cur) => cur.map((b) => (b.vendor_id === vendorId ? { ...b, vendor: { ...b.vendor, ...patch } } : b)));
    setReviews((cur) => cur.map((r) => (r.vendor?.id === vendorId ? { ...r, vendor: { ...r.vendor, ...patch } } : r)));
    setDetailVendor((cur) => (cur && cur.id === vendorId ? { ...cur, ...patch } : cur));
  }

  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <DiscoveryHeader
        onOpenMap={() => navigate("/map?view=map")}
        session={session}
        userEmail={userEmail}
        initials={initials}
        firstName={firstName}
        avatarUrl={avatarUrl}
        savedCount={bookmarks.length}
        activeSection={tab === "reviews" ? "reviews" : "saved"}
        onOpenDiscover={() => navigate("/map")}
        onOpenSaved={() => { setTab("bookmarks"); navigate("/engagement"); }}
        onOpenReviews={() => { setTab("reviews"); navigate("/engagement?tab=reviews"); }}
        onLogin={() => navigate("/login")}
        onSignUp={() => navigate("/login")}
        onOpenProfile={() => navigate("/profile")}
        onOpenVendor={(id) => navigate(`/map?vendor=${id}`)}
      />

      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
        <div className="mb-6">
          <p className="mb-3 mt-0 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">Your TrueBites collection</p>
          <h1 className="m-0 font-display text-[clamp(28px,5vw,44px)] font-medium leading-tight tracking-[-0.03em] text-ink">
            {tab === "reviews" ? "My reviews" : "Saved places"}
          </h1>
          <p className="mb-0 mt-2 text-sm text-muted">
            {tab === "reviews" ? "Keep track of the places and flavours you have shared." : "Keep the Melaka places you want to return to."}
          </p>
        </div>
        {tab === "bookmarks" && (
          <div className="flex flex-col gap-5">
            {/* Folder tabs — horizontal row, Instagram-style */}
            <div className="no-scrollbar flex snap-x items-center gap-2 overflow-x-auto scroll-smooth pb-2">
              {creatingFolder ? (
                <div className="flex min-w-[320px] shrink-0 gap-1.5">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    placeholder="Folder name"
                    className="min-h-11 min-w-0 flex-1 rounded-full border border-sand px-3 text-[12.5px] outline-none focus:border-forest"
                  />
                  <button
                    onClick={handleCancelCreateFolder}
                    className="min-h-11 shrink-0 rounded-full border border-muted bg-white px-4 text-[12.5px] font-semibold text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    className="min-h-11 shrink-0 rounded-full bg-terracotta px-4 text-[12.5px] font-semibold text-white"
                  >
                    Create
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingFolder(true)}
                  className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-dashed border-sand px-3 text-[12.5px] text-muted"
                >
                  <Plus size={13} /> New folder
                </button>
              )}

              <FolderPill label="All" count={bookmarks.length} active={activeFolder === "all"} onClick={() => setActiveFolder("all")} />
              {folders.map((f) => (
                <FolderPill
                  key={f.id} label={f.name}
                  count={bookmarks.filter((b) => b.folder_id === f.id).length}
                  active={activeFolder === f.id}
                  onClick={() => setActiveFolder(f.id)}
                  onDelete={!f.is_default ? () => setPendingDeleteFolder(f) : null}
                />
              ))}
            </div>

            <section className="flex flex-col gap-5">
              {visibleBookmarks.length === 0 ? (
                <Empty icon="🔖" text="No bookmarks in this folder yet." />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {pagedBookmarks.map((b) => (
                      <div key={b.vendor_id} className={`flex flex-col ${CARD_STRETCH} ${CARD_MERGE_FOOTER}`}>
                        <VendorCard
                          vendor={b.vendor}
                          inTrip={false}
                          bookmarked={true}
                          onToggleBookmark={() => setPendingUnbookmarkVendor(b.vendor)}
                          onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
                          onOpenDetail={setDetailVendor}
                        />
                        <FolderMoveSelect row={b} folders={folders} onMove={(folderId) => handleMoveBookmark(b.vendor_id, folderId)} />
                      </div>
                    ))}
                  </div>
                  <Pagination page={bookmarkPage} totalPages={bookmarkPageCount} onChange={setBookmarkPage} />
                </>
              )}
            </section>
          </div>
        )}

        {tab === "reviews" && (
          <section className="flex flex-col gap-5">
            {myReviews.length > 0 && (
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="relative min-h-11 flex-1">
                  <Search size={14} color={MUTED} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={reviewSearch}
                    onChange={(e) => setReviewSearch(e.target.value)}
                    placeholder="Search by place or review text"
                    className="min-h-11 w-full rounded-full border border-sand bg-white pl-9 pr-3 text-[12.5px] outline-none focus:border-forest"
                  />
                </div>
                <select
                  value={reviewRating}
                  onChange={(e) => setReviewRating(e.target.value)}
                  aria-label="Filter by rating"
                  className="min-h-11 shrink-0 rounded-full border border-sand bg-white px-3 text-[12.5px] text-ink outline-none focus:border-forest"
                >
                  <option value="all">All ratings</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
                <select
                  value={reviewSort}
                  onChange={(e) => setReviewSort(e.target.value)}
                  aria-label="Sort reviews"
                  className="min-h-11 shrink-0 rounded-full border border-sand bg-white px-3 text-[12.5px] text-ink outline-none focus:border-forest"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="highest">Highest rated</option>
                  <option value="lowest">Lowest rated</option>
                </select>
              </div>
            )}

            {myReviews.length === 0 ? (
              <Empty icon="⭐" text="No reviews yet. Be the first to review!" />
            ) : visibleReviews.length === 0 ? (
              <Empty icon="🔍" text="No reviews match your filters." />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {pagedReviews.map((r) => (
                    <div key={r.id} className={`flex flex-col ${CARD_STRETCH} ${CARD_MERGE_FOOTER}`}>
                      <VendorCard
                        vendor={r.vendor}
                        inTrip={false}
                        bookmarked={bookmarkedVendorIds.has(r.vendor.id)}
                        onToggleBookmark={() => toggleBookmarkForVendor(r.vendor)}
                        onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
                        onOpenDetail={setDetailVendor}
                      />
                      <div className={CARD_FOOTER}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={12} color="#A35D47" fill={i < r.rating ? "#A35D47" : "none"} />
                        ))}
                        <span>Your review · {new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={reviewPage} totalPages={reviewPageCount} onChange={setReviewPage} />
              </>
            )}
          </section>
        )}
      </main>

      {detailVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          inTrip={false}
          bookmarked={bookmarkedVendorIds.has(detailVendor.id)}
          onToggleBookmark={() => toggleBookmarkFromDetail(detailVendor.id)}
          onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
          onClose={() => setDetailVendor(null)}
          onVendorUpdated={patchVendorStats}
        />
      )}

      {pendingSaveVendor && (
        <FolderPickerModal
          vendorName={pendingSaveVendor.name}
          folders={folders}
          onClose={() => setPendingSaveVendor(null)}
          onSave={confirmSaveBookmark}
          onCreateFolder={createFolderAndSave}
        />
      )}

      {pendingDeleteFolder && (
        <div
          onClick={() => setPendingDeleteFolder(null)}
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white p-5 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-w-[340px] sm:rounded-2xl"
          >
            <h3 className="mb-1.5 mt-0 font-display text-[17px] text-forest">Delete "{pendingDeleteFolder.name}"?</h3>
            <p className="mb-4 mt-0 text-[13px] text-muted">Its bookmarks will move to Default. This can't be undone.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setPendingDeleteFolder(null)}
                className="min-h-11 rounded-lg border border-sand bg-white px-4 text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleDeleteFolder(pendingDeleteFolder.id); setPendingDeleteFolder(null); }}
                className="min-h-11 rounded-lg bg-[#c0392b] px-4 text-[13px] font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingUnbookmarkVendor && (
        <div
          onClick={() => setPendingUnbookmarkVendor(null)}
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white p-5 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-w-[340px] sm:rounded-2xl"
          >
            <h3 className="mb-1.5 mt-0 font-display text-[17px] text-forest">Remove "{pendingUnbookmarkVendor.name}"?</h3>
            <p className="mb-4 mt-0 text-[13px] text-muted">This will remove it from your saved places.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setPendingUnbookmarkVendor(null)}
                className="min-h-11 rounded-lg border border-sand bg-white px-4 text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmUnbookmark}
                className="min-h-11 rounded-lg bg-[#c0392b] px-4 text-[13px] font-semibold text-white"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}

const PILL = "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px]";

function FolderPill({ label, count, active, onClick, onDelete }) {
  return (
    <div className={active ? `${PILL} border-forest bg-forest text-white` : `${PILL} border-sand bg-white text-forest`}>
      <button type="button" onClick={onClick} className={active ? "flex min-h-11 min-w-11 items-center justify-center font-semibold" : "flex min-h-11 min-w-11 items-center justify-center"}>
        {label} <span className="text-[11px] opacity-75">{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete folder ${label}`}
          className="grid min-h-11 min-w-11 place-items-center opacity-60 hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function FolderMoveSelect({ row, folders, onMove }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (folders.length === 0) return null;
  const current = folders.find((f) => f.id === row.folder_id) || folders[0];

  return (
    <div ref={wrapRef} className={`relative ${CARD_FOOTER}`}>
      <FolderInput size={13} color={MUTED} className="shrink-0" />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1 text-[11.5px] font-medium text-ink outline-none"
      >
        <span className="min-w-0 truncate">{current?.name}</span>
        <ChevronDown size={13} color={MUTED} className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-[200px] w-full min-w-[170px] overflow-y-auto rounded-lg border border-sand bg-white py-1 shadow-[0_10px_30px_rgba(64,84,74,0.2)]"
        >
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              role="option"
              aria-selected={f.id === current?.id}
              onClick={() => { onMove(f.id); setOpen(false); }}
              className={f.id === current?.id
                ? "flex min-h-9 w-full items-center gap-2 bg-forest/10 px-3 text-left text-[12.5px] font-semibold text-forest"
                : "flex min-h-9 w-full items-center gap-2 px-3 text-left text-[12.5px] text-ink hover:bg-chalk"}
            >
              <Check size={12} className={f.id === current?.id ? "shrink-0" : "invisible shrink-0"} />
              <span className="min-w-0 truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function pageList(current, total) {
  const delta = 1;
  const middle = [];
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) middle.push(i);

  const pages = [1];
  if (middle[0] > 2) pages.push("...");
  pages.push(...middle);
  if (middle[middle.length - 1] < total - 1) pages.push("...");
  if (total > 1) pages.push(total);
  return pages;
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1 pt-2">
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={page === 1}
        aria-label="First page"
        className="grid min-h-9 min-w-9 place-items-center rounded-full text-forest disabled:opacity-30"
      >
        <ChevronsLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="grid min-h-9 min-w-9 place-items-center rounded-full text-forest disabled:opacity-30"
      >
        <ChevronLeft size={16} />
      </button>
      {pageList(page, totalPages).map((p, i) => (
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-1.5 text-[13px] text-muted">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={p === page
              ? "grid min-h-9 min-w-9 place-items-center rounded-full bg-forest text-[13px] font-semibold text-white"
              : "grid min-h-9 min-w-9 place-items-center rounded-full text-[13px] text-ink hover:bg-sand/60"}
          >
            {p}
          </button>
        )
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className="grid min-h-9 min-w-9 place-items-center rounded-full text-forest disabled:opacity-30"
      >
        <ChevronRight size={16} />
      </button>
      <button
        type="button"
        onClick={() => onChange(totalPages)}
        disabled={page === totalPages}
        aria-label="Last page"
        className="grid min-h-9 min-w-9 place-items-center rounded-full text-forest disabled:opacity-30"
      >
        <ChevronsRight size={16} />
      </button>
    </div>
  );
}

function Empty({ icon, text }) {
  return (
    <div className="rounded-xl border border-sand bg-white px-5 py-12 text-center text-muted">
      <div className="mb-2 text-[32px]">{icon}</div>
      <div className="text-sm">{text}</div>
    </div>
  );
}
