import { useState } from "react";
import { Camera } from "lucide-react";
import { createReview, updateReview, uploadReviewPhoto } from "../../api/engagement";
import StarRating from "./StarRating";

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export default function ReviewForm({ vendorId, initial, onSaved, onCancel, notify }) {
  const [rating, setRating] = useState(initial?.rating || 0);
  const [body, setBody] = useState(initial?.body || "");
  const [isAnonymous, setIsAnonymous] = useState(initial?.is_anonymous || false);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handlePhotoChange(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      notify?.("Only JPEG, PNG and WebP formats are allowed.", true);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      notify?.("File size must be under 10MB.", true);
      return;
    }
    setPhotoFile(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) { notify?.("Please select a star rating.", true); return; }
    setSaving(true);
    setError("");
    try {
      const { review, vendor } = initial
        ? await updateReview(initial.id, { rating, body, is_anonymous: isAnonymous })
        : await createReview(vendorId, { rating, body, is_anonymous: isAnonymous });

      let photos = initial?.review_photos || [];
      if (photoFile) {
        const { photo } = await uploadReviewPhoto(review.id, photoFile);
        photos = [...photos, photo];
      }

      onSaved({ ...review, is_anonymous: isAnonymous, review_photos: photos, isOwn: true, likes: initial?.likes ?? 0, dislikes: initial?.dislikes ?? 0, myVote: initial?.myVote ?? null }, vendor);
      notify?.(initial ? "Review updated successfully!" : "Review submitted successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <StarRating value={rating} onChange={setRating} size={22} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share what you tried and how it was…"
        rows={3}
        className="w-full resize-y rounded-[10px] border border-sand px-3 py-2.5 text-[13.5px] outline-none focus:border-forest"
      />
      <label className="flex min-h-6 w-fit cursor-pointer items-center gap-1.5 text-[12.5px] text-muted">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="size-3.5"
        />
        Post anonymously
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-[12.5px] text-muted">
          <Camera size={15} />
          <span className="truncate">{photoFile ? photoFile.name : "Add a photo"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg border border-sand bg-white px-4 text-[13px]"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-lg bg-forest px-4 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Post review"}
          </button>
        </div>
      </div>
      {error && <div className="text-[12.5px] text-[#c0392b]">{error}</div>}
    </form>
  );
}
