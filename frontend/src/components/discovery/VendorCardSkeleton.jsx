// Placeholder shown in the vendor grid while the initial nearby-vendors fetch
// is in flight, so the page never looks frozen/blank during that request.
// Mirrors VendorCard's real proportions (same aspect-[4/3] image box) so the
// grid doesn't jump when real cards replace these.
export default function VendorCardSkeleton() {
  return (
    <div className="overflow-hidden rounded border border-sand bg-white" aria-hidden="true">
      <div className="aspect-[4/3] animate-pulse bg-sand" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-sand" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-sand" />
        <div className="h-3 w-full animate-pulse rounded bg-sand" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-sand" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-sand" />
      </div>
    </div>
  );
}
