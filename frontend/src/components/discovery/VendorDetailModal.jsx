import { useEffect, useMemo, useState } from "react";
import { X, Bookmark, Bot, Play, Wallet, MapPin, Star } from "lucide-react";
import {
  categoryLabel, vendorGallery, creatorHandle,
  priceLabel, photoAltText, FOOD_PHOTO_POSITION,
} from "../../lib/vendorDisplay";
import VendorGallery from "./VendorGallery";
import { useSession } from "../../lib/SessionContext";
import { getReviews, deleteReview, voteReview, removeVote } from "../../api/engagement";
import ReviewForm from "../engagement/ReviewForm";
import ReviewList from "../engagement/ReviewList";
import GuestPrompt from "./GuestPrompt";
import Toast from "../engagement/Toast";
import { customerSession } from "../../lib/roles";
import { useToast } from "../../lib/useToast";
import { ENGAGEMENT_TEST_MODE } from "../../lib/testMode";

const TERRACOTTA = "#A35D47";
const MUTED = "#69717A";

export default function VendorDetailModal({ vendor, inTrip, bookmarked, onToggleBookmark, onAddStop, onClose, onVendorUpdated, onReviewsChanged }) {
  const { session: authSession } = useSession();
  const session = customerSession(authSession);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [editingReview, setEditingReview] = useState(null); // "new" | review object | null
  const [stats, setStats] = useState({ average_rating: vendor?.average_rating, review_count: vendor?.review_count });
  const [toast, notify] = useToast();
  // Voting on a review and writing one are actions this modal owns directly
  // (unlike bookmarking, which is guarded one level up by whichever page
  // rendered this modal — see Dashboard.jsx's requireAuth) — so a guest
  // trying either one needs its own guard here. Same GuestPrompt popup
  // Dashboard/MapPage use elsewhere, instead of sending a guest straight to
  // /login with no context for why.
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    setReviewsLoading(true);
    setEditingReview(null);
    setStats({ average_rating: vendor.average_rating, review_count: vendor.review_count });
    getReviews(vendor.id)
      .then((r) => setReviews(r.reviews))
      .catch((e) => { console.error("failed to load reviews:", e.message); notify("Couldn't load reviews for this vendor.", true); })
      .finally(() => setReviewsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor?.id]);

  function applyVendorStats(newStats) {
    if (!newStats) return;
    setStats(newStats);
    onVendorUpdated?.(vendor.id, newStats);
  }

  const myReview = reviews.find((r) => r.isOwn);

  async function handleVote(reviewId, isLike) {
    if (!session && !ENGAGEMENT_TEST_MODE) { setGuestPromptOpen(true); return; }
    try {
      isLike === null ? await removeVote(reviewId) : await voteReview(reviewId, isLike);
      const r = await getReviews(vendor.id);
      setReviews(r.reviews);
    } catch (e) { console.error(e.message); notify("Couldn't record your vote. Please try again.", true); }
  }

  async function handleDeleteReview(id) {
    try {
      const res = await deleteReview(id);
      const r = await getReviews(vendor.id);
      setReviews(r.reviews);
      applyVendorStats(res.vendor);
      onReviewsChanged?.();
      notify("Review deleted successfully!");
    } catch (e) { notify(e.message, true); }
  }

  function handleReviewSaved(review, vendorStats) {
    setReviews((prev) => {
      const exists = prev.some((r) => r.id === review.id);
      return exists ? prev.map((r) => (r.id === review.id ? review : r)) : [review, ...prev];
    });
    setEditingReview(null);
    applyVendorStats(vendorStats);
    onReviewsChanged?.();
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const images = useMemo(() => (vendor ? vendorGallery(vendor) : []), [vendor]);

  if (!vendor) return null;

  const handle = creatorHandle(vendor);
  const price = priceLabel(vendor);
  const tags = (vendor.cuisine_types || vendor.signature_dishes || "")
    .split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-dvh w-full overflow-y-auto rounded-t-2xl bg-white shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-h-[88dvh] sm:max-w-[520px] sm:rounded-2xl"
      >
        {/* Hero image — autoplays through the storefront cover + food photos
            as soon as the modal opens; arrows/dots let a visitor take over.
            Taller than before (h-44/220 -> h-52/280) so VendorGallery's
            object-cover has more room to fill before anything gets cropped. */}
        <div className="relative h-52 overflow-hidden rounded-t-2xl sm:h-[280px]">
          {/* Same FOOD_PHOTO_POSITION crop as the card (imported from
              vendorDisplay.js, not a local copy) so a photo frames
              identically in both places — it shouldn't jump to a visibly
              different crop the moment the modal opens. */}
          <VendorGallery images={images} alt={(_, i) => photoAltText(vendor, i)} interval={2600} showArrows showDots objectPosition={FOOD_PHOTO_POSITION} />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(64,84,74,0.72)_0%,transparent_55%)]" />
          {/* Category badge */}
          <span className="absolute left-3 top-3 rounded-full bg-forest px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-white">
            {categoryLabel(vendor)}
          </span>
          {/* Action buttons */}
          <div className="absolute right-3 top-3 flex gap-2">
            <IconBtn onClick={() => onToggleBookmark(vendor.id)} label={bookmarked ? "Remove saved place" : "Save place"}>
              <Bookmark size={15} color={bookmarked ? TERRACOTTA : "#fff"} fill={bookmarked ? TERRACOTTA : "none"} strokeWidth={1.7} />
            </IconBtn>
            <IconBtn onClick={onClose} label="Close"><X size={16} color="#fff" /></IconBtn>
          </div>
          {/* Vendor name over gradient */}
          <div className="absolute inset-x-4 bottom-3.5 font-display text-[22px] font-bold text-white">
            {vendor.name}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3.5 px-5 pb-5 pt-4.5">
          {/* Meta row */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-muted">
            {stats.review_count > 0 && (
              <MetaItem
                icon={<Star size={14} color={TERRACOTTA} fill={TERRACOTTA} />}
                text={`${Number(stats.average_rating).toFixed(1)} (${stats.review_count} review${stats.review_count === 1 ? "" : "s"})`}
              />
            )}
            {price && <MetaItem icon={<Wallet size={14} color={TERRACOTTA} />} text={`${price}/person`} />}
          </div>

          {vendor.address && (
            <div className="flex items-start gap-1.5 text-[13px] text-muted">
              <MapPin size={14} color={TERRACOTTA} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{vendor.address}</span>
            </div>
          )}

          {/* Cuisine/dish tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="rounded-full border border-sand bg-chalk px-3 py-1 text-xs text-ink">{t}</span>
              ))}
            </div>
          )}

          {/* AI Review — terracotta left-border */}
          {vendor.ai_review_summary && (
            <div className="rounded-r-[10px] border-l-[3px] border-terracotta bg-[#FAFAF7] px-3.5 py-3">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.8px] text-terracotta">
                    <Bot size={13} /> AI Review Summary
                  </div>
                  <div className="mt-px text-[11px] text-muted">Extracted from TikTok video transcript</div>
                </div>
                {handle && (
                  <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted">
                    <Play size={9} fill={MUTED} /> {handle}
                  </span>
                )}
              </div>
              <div className="text-[13.5px] leading-normal text-ink">
                "{vendor.ai_review_summary}"
              </div>
            </div>
          )}

          {/* CTA row */}
          <div className="flex gap-2">
            <button
              onClick={() => onAddStop(vendor)}
              disabled={inTrip}
              className={inTrip
                ? "min-h-11 flex-1 rounded-[10px] border-[1.5px] border-sand bg-chalk px-4 text-[14.5px] font-semibold text-forest"
                : "min-h-11 flex-1 rounded-[10px] border-[1.5px] border-forest bg-forest px-4 text-[14.5px] font-semibold text-white transition-colors hover:bg-forest-light motion-reduce:transition-none"}
            >
              {inTrip ? "✓ Already in Your Trip" : "+ Add to Trip"}
            </button>
            <IconBtn onClick={() => onToggleBookmark(vendor.id)} bordered label={bookmarked ? "Remove saved place" : "Save place"}>
              <Bookmark size={16} color={bookmarked ? TERRACOTTA : MUTED} fill={bookmarked ? TERRACOTTA : "none"} strokeWidth={1.7} />
            </IconBtn>
          </div>

          {/* Reviews */}
          <div className="border-t border-sand pt-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 font-display text-base text-forest">Reviews</h3>
              {!myReview && editingReview !== "new" && (
                <button
                  onClick={() => { if (!session && !ENGAGEMENT_TEST_MODE) { setGuestPromptOpen(true); return; } setEditingReview("new"); }}
                  className="min-h-11 text-[13px] font-semibold text-terracotta"
                >
                  + Write a review
                </button>
              )}
            </div>

            {editingReview && (
              <div className="mb-3.5">
                <ReviewForm
                  vendorId={vendor.id}
                  initial={editingReview === "new" ? null : editingReview}
                  onSaved={handleReviewSaved}
                  onCancel={() => setEditingReview(null)}
                  notify={notify}
                />
              </div>
            )}

            {reviewsLoading ? (
              <div className="text-[13px] text-muted">Loading reviews…</div>
            ) : (
              <ReviewList
                reviews={[...reviews]
                  .filter((r) => editingReview !== r)
                  .sort((a, b) => Number(b.isOwn) - Number(a.isOwn))}
                onVote={handleVote}
                onEdit={setEditingReview}
                onDelete={handleDeleteReview}
              />
            )}
          </div>
        </div>
      </div>
      <Toast toast={toast} />
      <GuestPrompt open={guestPromptOpen} onClose={() => setGuestPromptOpen(false)} />
    </div>
  );
}

function MetaItem({ icon, text }) {
  return <span className="flex items-center gap-1.5">{icon}{text}</span>;
}

function IconBtn({ onClick, children, bordered, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={bordered
        ? "grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-sand bg-white"
        : "grid size-11 shrink-0 place-items-center rounded-full bg-forest/55"}
    >
      {children}
    </button>
  );
}
