import { ImageOff } from "lucide-react";

// Rendered by VendorGallery instead of an <img> whenever a slide is `null`
// (see vendorDisplay.js's placeholderImage — it returns null rather than an
// unrelated stock photo when a vendor has no real cover yet). Fills the same
// box a real photo would, so the grid never jumps or shows a broken-image
// icon — the honest "no photo yet" state, not a fake stand-in.
export default function PhotoUnavailablePlaceholder({ className = "" }) {
  return (
    <div className={`flex size-full flex-col items-center justify-center gap-1.5 bg-sand text-muted ${className}`}>
      <ImageOff size={22} strokeWidth={1.5} />
      <span className="text-[11px] font-medium">Photo unavailable</span>
    </div>
  );
}
