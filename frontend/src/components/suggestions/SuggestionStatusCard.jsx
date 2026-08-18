const STATUS_COPY = {
  submitted: ["Submitted", "Thanks — your suggestion is waiting for an admin review.", "bg-sand/60 text-ink"],
  under_review: ["Under review", "Our team is checking the vendor and source video.", "bg-amber-50 text-amber-800"],
  needs_info: ["More information needed", "An admin needs a little more information before continuing.", "bg-amber-50 text-amber-800"],
  accepted_for_processing: ["Accepted", "The admin team accepted this suggestion for preparation.", "bg-blue-50 text-blue-800"],
  processing: ["Being prepared", "The admin team is preparing the vendor information.", "bg-blue-50 text-blue-800"],
  admin_review: ["Final verification", "The vendor information is being checked before it goes live.", "bg-blue-50 text-blue-800"],
  draft_created: ["Almost ready", "The vendor draft is being completed by the admin team.", "bg-blue-50 text-blue-800"],
  published: ["Published", "This hidden gem is now available on TrueBites.", "bg-emerald-50 text-emerald-800"],
  duplicate: ["Similar vendor found", "The team found a similar vendor already in TrueBites.", "bg-slate-100 text-slate-700"],
  rejected: ["Not accepted", "This suggestion will not be added to the public guide.", "bg-red-50 text-red-700"],
  failed: ["Processing issue", "The team will retry or review this suggestion manually.", "bg-red-50 text-red-700"],
};

export default function SuggestionStatusCard({ suggestion, onEdit }) {
  const [label, description, tone] = STATUS_COPY[suggestion.status] || STATUS_COPY.submitted;
  return (
    <article className="border border-sand bg-white p-5 shadow-[0_12px_30px_rgba(54,61,65,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 font-display text-2xl font-medium text-ink">{suggestion.vendor_name}</h2>
          <p className="mb-0 mt-1 text-sm text-muted">{suggestion.location_text} · {suggestion.source_platform}</p>
        </div>
        <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>
      </div>
      <p className="mb-0 mt-4 text-sm leading-6 text-muted">{description}</p>
      {suggestion.status === "needs_info" && suggestion.admin_note && (
        <div className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
          <strong className="font-semibold block mb-1">Message from admin:</strong>
          {suggestion.admin_note}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-sand pt-3 text-xs text-muted">
        <span>Submitted {new Date(suggestion.created_at).toLocaleDateString()}</span>
        <a href={suggestion.source_url} target="_blank" rel="noreferrer" className="font-semibold text-forest underline underline-offset-2">Open source video</a>
        {suggestion.status === "needs_info" && <button type="button" onClick={onEdit} className="font-semibold text-amber-700 underline underline-offset-2">Edit suggestion</button>}
        {suggestion.status === "published" && suggestion.vendor_id && <a href={`/map?vendor=${suggestion.vendor_id}`} className="font-semibold text-forest underline underline-offset-2">View vendor</a>}
      </div>
    </article>
  );
}
