const STATUS_COPY = {
  submitted: ["Submitted", "Thanks — your suggestion is waiting for an admin review.", "bg-sand/60 text-ink"],
  under_review: ["Under review", "Our team is checking the details and source.", "bg-amber-50 text-amber-800"],
  needs_info: ["More information needed", "An admin needs a little more information before continuing.", "bg-amber-50 text-amber-800"],
  accepted_for_processing: ["Accepted", "The admin team accepted this suggestion for preparation.", "bg-blue-50 text-blue-800"],
  processing: ["Being prepared", "The admin team is preparing the vendor information.", "bg-blue-50 text-blue-800"],
  admin_review: ["Final verification", "The vendor information is being checked before it goes live.", "bg-blue-50 text-blue-800"],
  draft_created: ["Almost ready", "The vendor draft is being completed by the admin team.", "bg-blue-50 text-blue-800"],
  published: ["Published", "This recommendation has been accepted by TrueBites.", "bg-emerald-50 text-emerald-800"],
  duplicate: ["Similar suggestion found", "The team found a similar recommendation already in TrueBites.", "bg-slate-100 text-slate-700"],
  rejected: ["Not accepted", "This suggestion will not be added to the public guide.", "bg-red-50 text-red-700"],
  failed: ["Processing issue", "The team will retry or review this suggestion manually.", "bg-red-50 text-red-700"],
};

export default function SuggestionStatusCard({ suggestion, onEdit }) {
  const [label, description, tone] = STATUS_COPY[suggestion.status] || STATUS_COPY.submitted;
  const isCreator = suggestion.suggestion_type === "creator";
  const subject = isCreator ? suggestion.creator_name : suggestion.vendor_name;
  const sourceLabel = isCreator ? "Open profile" : "Open source video";
  const sourceUrl = isCreator ? suggestion.creator_profile_url || suggestion.source_url : suggestion.source_url;
  return (
    <article className="rounded border border-sand bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-forest hover:shadow-md motion-reduce:transition-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-terracotta">{isCreator ? "Influencer / channel" : "Vendor"}</div>
          <h2 className="m-0 font-display text-[19px] font-semibold leading-[1.15] text-ink">{subject}</h2>
          <p className="mb-0 mt-1 truncate text-sm text-muted">{isCreator ? `${suggestion.source_platform} profile${suggestion.creator_focus ? ` · ${suggestion.creator_focus}` : ""}` : `${suggestion.location_text} · ${suggestion.source_platform}${suggestion.influencer_name ? ` · ${suggestion.influencer_name}` : ""}`}</p>
        </div>
        <span className={`inline-flex w-fit rounded-md px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>
      </div>
      <p className="mb-0 mt-4 text-xs leading-5 text-muted">{description}</p>
      {suggestion.status === "needs_info" && suggestion.admin_note && (
        <div className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
          <strong className="font-semibold block mb-1">Message from admin:</strong>
          {suggestion.admin_note}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sand pt-3 text-[11px] text-muted">
        <span>Submitted {new Date(suggestion.created_at).toLocaleDateString()}</span>
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-forest underline underline-offset-2">{sourceLabel}</a>
        {suggestion.status === "needs_info" && <button type="button" onClick={onEdit} className="font-semibold text-amber-700 underline underline-offset-2">Edit suggestion</button>}
        {suggestion.status === "published" && suggestion.vendor_id && <a href={`/discover?vendor=${suggestion.vendor_id}`} className="font-semibold text-forest underline underline-offset-2">View vendor</a>}
      </div>
    </article>
  );
}
