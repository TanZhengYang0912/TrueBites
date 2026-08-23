import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import TranscriptStep from "../ai/TranscriptStep";
import SummaryStep from "../ai/SummaryStep";
import ExtractionStep from "../ai/ExtractionStep";
import {
  createAdminSuggestionDraft,
  getAdminSuggestionProcessing,
  processAdminSuggestion,
  publishAdminSuggestion,
  updateAdminSuggestionStatus,
} from "../../api/admin";

const ACTIVE_STATUSES = new Set(["processing", "admin_review"]);

export default function SuggestionDetailModal({ suggestion, onClose, onChanged }) {
  const [current, setCurrent] = useState(suggestion);
  const [jobData, setJobData] = useState({});
  const [stage, setStage] = useState(suggestion.status === "admin_review" ? "transcript" : "details");
  const [reviewSummary, setReviewSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setCurrent(suggestion); }, [suggestion]);

  useEffect(() => {
    if (!current.ai_job_id || !ACTIVE_STATUSES.has(current.status)) return undefined;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const payload = await getAdminSuggestionProcessing(current.id);
        if (!active) return;
        setCurrent(payload.suggestion);
        setJobData(payload.job || {});
        if (payload.job?.summary) setReviewSummary((value) => value || payload.job.summary);
        if (payload.job?.status === "completed" || payload.job?.status === "error") return;
        timer = setTimeout(poll, 2000);
      } catch (pollError) {
        if (active) setError(pollError.message || "Unable to read processing status.");
      }
    };
    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [current.id, current.ai_job_id, current.status]);

  async function runAction(action) {
    setBusy(true);
    setError("");
    try {
      const payload = await action();
      const next = payload.suggestion || current;
      setCurrent(next);
      onChanged?.(next);
      return payload;
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleProcess() {
    const payload = await runAction(() => processAdminSuggestion(current.id));
    if (payload) {
      setJobData(payload.job || {});
      setStage("transcript");
    }
  }

  async function handleStatus(status) {
    let admin_note = undefined;
    if (status === "needs_info") {
      admin_note = window.prompt("What information is needed from the user?");
      if (admin_note === null) return;
    }
    await runAction(() => updateAdminSuggestionStatus(current.id, { status, admin_note }));
  }

  async function handleCreateDraft(payload) {
    const result = await createAdminSuggestionDraft(current.id, payload);
    if (result.status !== "duplicate_review_required") {
      setCurrent(result.suggestion || current);
      onChanged?.(result.suggestion || current);
    }
    return result;
  }

  async function handlePublish() {
    await runAction(() => publishAdminSuggestion(current.id));
  }

  const submitter = current.submitter?.name || current.submitter?.email || current.user_id || "Customer";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={`Suggestion for ${current.vendor_name}`}>
      <div className="max-h-[94dvh] w-full max-w-5xl overflow-y-auto bg-chalk shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-sand bg-chalk/95 px-5 py-4 backdrop-blur md:px-7">
          <div>
            <p className="mb-1 mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-terracotta">Community suggestion</p>
            <h2 className="m-0 font-display text-3xl font-medium text-ink">{current.vendor_name}</h2>
            <p className="mb-0 mt-1 text-sm text-muted">{current.location_text} · submitted by {submitter}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center border border-sand text-xl text-muted hover:text-ink" aria-label="Close suggestion">×</button>
        </div>

        <div className="grid gap-5 p-5 md:p-7 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <aside className="grid content-start gap-4">
            <section className="border border-sand bg-white p-5">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="m-0 text-sm font-bold uppercase tracking-[0.1em] text-muted">Submission</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                  ["rejected", "duplicate", "failed"].includes(current.status) ? "bg-red-100 text-red-800" :
                  ["published", "draft_created"].includes(current.status) ? "bg-emerald-100 text-emerald-800" :
                  ["accepted_for_processing", "processing", "admin_review"].includes(current.status) ? "bg-blue-100 text-blue-800" :
                  ["under_review", "needs_info"].includes(current.status) ? "bg-amber-100 text-amber-800" :
                  "bg-sand/70 text-ink"
                }`}>
                  {current.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="grid gap-5">
                <div>
                  <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">Source Video</h4>
                  <a href={current.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded bg-forest/10 px-3 py-2 text-sm font-semibold text-forest transition-colors hover:bg-forest/20">
                    <ExternalLink size={14} /> View Source Video
                  </a>
                </div>

                <div>
                  <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">Recommended by</h4>
                  <p className="m-0 mt-1 text-base font-medium text-ink">{current.influencer_name || "Not provided"}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">Category</h4>
                    <p className="m-0 mt-1 text-base font-medium text-ink">{current.category || "Not provided"}</p>
                  </div>
                  <div>
                    <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">Price range</h4>
                    <p className="m-0 mt-1 text-base font-medium text-ink">{current.price_range || "Not provided"}</p>
                  </div>
                  <div className="col-span-2">
                    <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">Signature dish</h4>
                    <p className="m-0 mt-1 text-base font-medium text-ink">{current.signature_dish || "Not provided"}</p>
                  </div>
                </div>

                <div className="rounded-md bg-sand/30 p-4">
                  <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">Why they recommend it</h4>
                  <p className="m-0 mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{current.reason}</p>
                </div>
                
                {current.additional_note && (
                  <div>
                    <h4 className="m-0 text-[10px] font-bold uppercase tracking-wider text-muted">Additional note</h4>
                    <p className="m-0 mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{current.additional_note}</p>
                  </div>
                )}
              </div>
            </section>

            {error && <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <section className="grid gap-2 border border-sand bg-white p-5">
              <h3 className="m-0 text-sm font-bold uppercase tracking-[0.1em] text-muted">Admin actions</h3>
              {current.status === "submitted" && <button type="button" disabled={busy} onClick={() => handleStatus("under_review")} className="min-h-10 rounded bg-forest px-3 text-sm font-semibold text-white disabled:opacity-50">Start review</button>}
              {["submitted", "under_review", "needs_info"].includes(current.status) && <button type="button" disabled={busy} onClick={() => handleStatus("needs_info")} className="min-h-10 rounded border border-sand px-3 text-sm font-semibold text-ink disabled:opacity-50">Request more information</button>}
              {["under_review", "accepted_for_processing", "failed"].includes(current.status) && <button type="button" disabled={busy} onClick={handleProcess} className="min-h-10 rounded bg-forest px-3 text-sm font-semibold text-white disabled:opacity-50">{current.status === "failed" ? "Retry AI processing" : "Process with AI"}</button>}
              {["submitted", "under_review", "needs_info", "admin_review"].includes(current.status) && <button type="button" disabled={busy} onClick={() => handleStatus("duplicate")} className="min-h-10 rounded border border-sand px-3 text-sm font-semibold text-ink disabled:opacity-50">Mark as duplicate</button>}
              {["submitted", "under_review", "needs_info", "admin_review"].includes(current.status) && <button type="button" disabled={busy} onClick={() => handleStatus("rejected")} className="min-h-10 rounded border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50">Reject</button>}
              {current.status === "draft_created" && <button type="button" disabled={busy} onClick={handlePublish} className="min-h-10 rounded bg-forest px-3 text-sm font-semibold text-white disabled:opacity-50">Publish vendor</button>}
              {current.vendor_id && <a href="/admin/vendors2" className="mt-1 text-center text-xs font-semibold text-forest underline underline-offset-2">Open vendor management</a>}
            </section>
          </aside>

          <section className="min-w-0">
            {stage === "details" && (
              <div className="grid min-h-80 place-items-center border border-dashed border-sand bg-white p-8 text-center">
                <div><div className="mb-3 text-4xl">✦</div><h3 className="m-0 font-display text-2xl font-medium">Ready for review</h3><p className="mx-auto mb-0 mt-2 max-w-md text-sm leading-6 text-muted">Accept this suggestion for processing when the source and Malacca location look credible.</p></div>
              </div>
            )}
            {stage === "transcript" && <TranscriptStep jobData={jobData} onTranscriptReady={() => setStage("summary")} onRetry={handleProcess} />}
            {stage === "summary" && <SummaryStep jobData={jobData} summaryValue={reviewSummary} onSummaryChange={setReviewSummary} onNext={() => setStage("extraction")} onBack={() => setStage("transcript")} />}
            {stage === "extraction" && <ExtractionStep jobData={jobData} reviewSummary={reviewSummary || jobData.summary || ""} onBack={() => setStage("summary")} onReset={() => setStage("details")} onCreateDraft={handleCreateDraft} />}
            {current.status === "draft_created" && stage === "details" && <div className="border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">Draft vendor created. Complete any missing vendor fields, then publish it when it is ready.</div>}
            {current.status === "published" && <div className="border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">Published. This vendor is now eligible to appear on the public Malacca discovery map.</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
