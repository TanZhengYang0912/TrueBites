import { useState } from "react";
import { createPortal } from "react-dom";
import { ThumbsUp, ThumbsDown, Pencil, Trash2 } from "lucide-react";
import StarRating from "./StarRating";
import ImageLightbox from "./ImageLightbox";

const TERRACOTTA = "#A35D47";
const MUTED = "#69717A";

const ICON_BTN = "grid size-11 shrink-0 place-items-center rounded-full bg-chalk";
const VOTE_BTN = "flex min-h-11 items-center gap-1 text-[12.5px]";

export default function ReviewList({ reviews, onVote, onEdit, onDelete }) {
  const [openPhoto, setOpenPhoto] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  if (!reviews.length) {
    return <div className="py-2 text-[13px] text-muted">No reviews yet. Be the first to review!</div>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {reviews.map((r) => (
        <div key={r.id} className="border-b border-sand pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-forest">
                {r.author_name || "Anonymous"}
                {r.isOwn && <span className="font-medium text-terracotta"> · You</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <StarRating value={r.rating} size={13} />
                <span className="text-[11.5px] text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                {r.isOwn && r.is_hidden && (
                  <span className="text-[11px] text-[#c0392b]">
                    Hidden{r.hidden_reason === "profanity" ? " (flagged for language)" : " by admin"} — only you can see this
                  </span>
                )}
              </div>
            </div>
            {r.isOwn && (
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => onEdit(r)} aria-label="Edit review" className={ICON_BTN}>
                  <Pencil size={13} color={MUTED} />
                </button>
                <button onClick={() => setPendingDelete(r.id)} aria-label="Delete review" className={ICON_BTN}>
                  <Trash2 size={13} color={MUTED} />
                </button>
              </div>
            )}
          </div>

          {r.body && <div className="mt-1.5 break-words text-[13.5px] leading-normal text-ink">{r.body}</div>}

          {r.review_photos?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.review_photos.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt="Review attachment"
                  onClick={() => setOpenPhoto(p.url)}
                  className="size-16 cursor-zoom-in rounded-lg border border-sand object-cover"
                />
              ))}
            </div>
          )}

          {!r.isOwn && (
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => onVote(r.id, r.myVote === true ? null : true)}
                className={r.myVote === true ? `${VOTE_BTN} text-terracotta` : `${VOTE_BTN} text-muted`}
              >
                <ThumbsUp size={13} fill={r.myVote === true ? TERRACOTTA : "none"} /> {r.likes}
              </button>
              <button
                onClick={() => onVote(r.id, r.myVote === false ? null : false)}
                className={r.myVote === false ? `${VOTE_BTN} text-terracotta` : `${VOTE_BTN} text-muted`}
              >
                <ThumbsDown size={13} fill={r.myVote === false ? TERRACOTTA : "none"} /> {r.dislikes}
              </button>
            </div>
          )}
        </div>
      ))}
      <ImageLightbox src={openPhoto} onClose={() => setOpenPhoto(null)} />

      {pendingDelete && createPortal(
        // Rendered via a portal straight into <body>, same reasoning as
        // ImageLightbox: ReviewList's own caller (VendorDetailModal) animates
        // its card with a CSS transform (animate-modal-in), which makes that
        // card the containing block for any `position: fixed` descendant —
        // without the portal this popup was "fixed" relative to that card
        // instead of the real viewport, so it showed up confined to/on top
        // of the vendor detail modal instead of as a true full-screen popup.
        <div
          onClick={() => setPendingDelete(null)}
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white p-5 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-w-[340px] sm:rounded-2xl"
          >
            <h3 className="mb-1.5 mt-0 font-display text-[17px] text-forest">Delete this review?</h3>
            <p className="mb-4 mt-0 text-[13px] text-muted">This can't be undone.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setPendingDelete(null)}
                className="min-h-11 rounded-lg border border-sand bg-white px-4 text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(pendingDelete); setPendingDelete(null); }}
                className="min-h-11 rounded-lg bg-[#c0392b] px-4 text-[13px] font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
