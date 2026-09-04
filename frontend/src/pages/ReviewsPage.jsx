import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Search, Star } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import {
  addBookmark,
  createFolder,
  getBookmarks,
  getFolders,
  getMyReviews,
  removeBookmark,
} from "../api/engagement";
import Toast from "../components/engagement/Toast";
import DiscoveryPageShell from "../components/discovery/DiscoveryPageShell";
import DiscoveryPageIntro from "../components/discovery/DiscoveryPageIntro";
import { useToast, sleep } from "../lib/useToast";
import VendorCard from "../components/discovery/VendorCard";
import { customerSession } from "../lib/roles";
import VendorDetailModal from "../components/discovery/VendorDetailModal";
import FolderPickerModal from "../components/engagement/FolderPickerModal";
import { Empty, Pagination } from "../components/engagement/EngagementPageControls";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";

const TERRACOTTA = "#A35D47";
const MUTED = "#69717A";
const PAGE_SIZE = 6;
const CARD_STRETCH = "[&>article]:flex-1";
const CARD_MERGE_FOOTER = "[&>article]:rounded-b-none [&>article]:border-b-0 [&>article]:hover:translate-y-0";
const CARD_FOOTER = "flex h-11 shrink-0 items-center gap-1.5 overflow-hidden rounded-b border border-t-0 border-sand bg-chalk px-3 text-[11px] text-muted";

export default function ReviewsPage() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);
  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewRating, setReviewRating] = useState("all");
  const [reviewSort, setReviewSort] = useState("newest");
  const [reviewPage, setReviewPage] = useState(1);
  const [detailVendor, setDetailVendor] = useState(null);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null);
  const [pendingUnbookmarkVendor, setPendingUnbookmarkVendor] = useState(null);
  const [toast, notify] = useToast();
  const bookmarkedVendorIds = new Set(bookmarks.map((bookmark) => bookmark.vendor_id));

  useEffect(() => {
    if (!session && !ENGAGEMENT_TEST_MODE) return;
    refreshBookmarks();
    refreshReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    setReviewPage(1);
  }, [reviewSearch, reviewRating, reviewSort]);

  function refreshBookmarks() {
    getFolders()
      .then((payload) => setFolders(payload.folders))
      .catch((error) => { console.error(error.message); notify("Couldn't load your folders.", true); });
    getBookmarks()
      .then((payload) => setBookmarks(payload.bookmarks))
      .catch((error) => { console.error(error.message); notify("Couldn't load your bookmarks.", true); });
  }

  function refreshReviews() {
    return getMyReviews()
      .then((payload) => setReviews(payload.reviews))
      .catch((error) => { console.error(error.message); notify("Couldn't load your reviews.", true); });
  }

  function refreshReviewsAfterMutation() {
    setReviewPage(1);
    return refreshReviews();
  }

  if (sessionLoading) return null;

  if (!session && !ENGAGEMENT_TEST_MODE) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-chalk px-4 font-body">
        <div className="w-full max-w-[420px] rounded-2xl border border-sand bg-white px-6 py-10 text-center">
          <Heart size={28} color={TERRACOTTA} className="mx-auto mb-2.5" />
          <h2 className="mb-2 mt-0 font-display text-xl text-forest">Sign in to see your bookmarks &amp; reviews</h2>
          <button onClick={() => navigate("/login")} className="mt-2 min-h-11 w-full rounded-[10px] bg-forest px-5 text-sm font-semibold text-white">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const myReviews = reviews.filter((review) => review.vendor);
  const visibleReviews = myReviews
    .filter((review) => reviewRating === "all" || review.rating === Number(reviewRating))
    .filter((review) => {
      const query = reviewSearch.trim().toLowerCase();
      if (!query) return true;
      return review.vendor.name?.toLowerCase().includes(query) || review.body?.toLowerCase().includes(query);
    })
    .sort((left, right) => {
      if (reviewSort === "oldest") return new Date(left.created_at) - new Date(right.created_at);
      if (reviewSort === "highest") return right.rating - left.rating;
      if (reviewSort === "lowest") return left.rating - right.rating;
      return new Date(right.created_at) - new Date(left.created_at);
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

  async function handleRemoveBookmark(vendorId) {
    try {
      await removeBookmark(vendorId);
      refreshBookmarks();
      notify("Vendor removed from wishlist.");
    } catch (error) {
      notify(error.message, true);
    }
  }

  function toggleBookmarkForVendor(vendor) {
    if (bookmarkedVendorIds.has(vendor.id)) {
      setPendingUnbookmarkVendor(vendor);
      return;
    }
    setPendingSaveVendor(vendor);
  }

  function toggleBookmarkFromDetail() {
    toggleBookmarkForVendor(detailVendor);
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

  function patchVendorStats(vendorId, patch) {
    setReviews((current) => current.map((review) => (
      review.vendor?.id === vendorId ? { ...review, vendor: { ...review.vendor, ...patch } } : review
    )));
    setDetailVendor((current) => (current && current.id === vendorId ? { ...current, ...patch } : current));
  }

  return (
    <>
      <DiscoveryPageShell
        headerProps={{
          onOpenMap: () => navigate("/map?view=map"),
          session,
          userEmail,
          initials,
          firstName,
          avatarUrl,
          savedCount: bookmarks.length,
          activeSection: "reviews",
          onOpenDiscover: () => navigate("/map"),
          onLogin: () => navigate("/login"),
          onSignUp: () => navigate("/login"),
          onOpenProfile: () => navigate("/profile"),
          onOpenVendor: (id) => navigate(`/map?vendor=${id}`),
        }}
      >
        <DiscoveryPageIntro
          eyebrow="Your TrueBites collection"
          title="My reviews"
          description="Keep track of the places and flavours you have shared."
        />
        <section className="flex flex-col gap-5">
          {myReviews.length > 0 && (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative min-h-11 flex-1">
                <Search size={14} color={MUTED} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={reviewSearch}
                  onChange={(event) => setReviewSearch(event.target.value)}
                  placeholder="Search by place or review text"
                  className="min-h-11 w-full rounded-full border border-sand bg-white pl-9 pr-3 text-[12.5px] outline-none focus:border-forest"
                />
              </div>
              <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} aria-label="Filter by rating" className="min-h-11 shrink-0 rounded-full border border-sand bg-white px-3 text-[12.5px] text-ink outline-none focus:border-forest">
                <option value="all">All ratings</option>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option key={rating} value={rating}>{rating} star{rating > 1 ? "s" : ""}</option>
                ))}
              </select>
              <select value={reviewSort} onChange={(event) => setReviewSort(event.target.value)} aria-label="Sort reviews" className="min-h-11 shrink-0 rounded-full border border-sand bg-white px-3 text-[12.5px] text-ink outline-none focus:border-forest">
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
                {pagedReviews.map((review) => (
                  <div key={review.id} className={`flex flex-col ${CARD_STRETCH} ${CARD_MERGE_FOOTER}`}>
                    <VendorCard
                      vendor={review.vendor}
                      inTrip={false}
                      bookmarked={bookmarkedVendorIds.has(review.vendor.id)}
                      onToggleBookmark={() => toggleBookmarkForVendor(review.vendor)}
                      onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
                      onOpenDetail={setDetailVendor}
                    />
                    <div className={CARD_FOOTER}>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} size={12} color={TERRACOTTA} fill={index < review.rating ? TERRACOTTA : "none"} />
                      ))}
                      <span>Your review · {new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={reviewPage} totalPages={reviewPageCount} onChange={setReviewPage} />
            </>
          )}
        </section>
      </DiscoveryPageShell>

      {detailVendor && (
        <VendorDetailModal
          key={detailVendor.id}
          vendor={detailVendor}
          inTrip={false}
          bookmarked={bookmarkedVendorIds.has(detailVendor.id)}
          onToggleBookmark={toggleBookmarkFromDetail}
          onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
          onClose={() => setDetailVendor(null)}
          onVendorUpdated={patchVendorStats}
          onReviewsChanged={refreshReviewsAfterMutation}
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

      {pendingUnbookmarkVendor && (
        <div onClick={() => setPendingUnbookmarkVendor(null)} className="fixed inset-0 z-[1200] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5">
          <div onClick={(event) => event.stopPropagation()} className="w-full rounded-t-2xl bg-white p-5 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-w-[340px] sm:rounded-2xl">
            <h3 className="mb-1.5 mt-0 font-display text-[17px] text-forest">Remove "{pendingUnbookmarkVendor.name}"?</h3>
            <p className="mb-4 mt-0 text-[13px] text-muted">This will remove it from your saved places.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setPendingUnbookmarkVendor(null)} className="min-h-11 rounded-lg border border-sand bg-white px-4 text-[13px]">Cancel</button>
              <button onClick={confirmUnbookmark} className="min-h-11 rounded-lg bg-[#c0392b] px-4 text-[13px] font-semibold text-white">Remove</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
