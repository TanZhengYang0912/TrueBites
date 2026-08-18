import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import { customerSession } from "../lib/roles";
import { getAccountStatus, submitAppeal } from "../api/engagement";
import { humanizeDuration } from "../lib/suspension";
import StaticPageLayout from "../components/StaticPageLayout";

const APPEAL_MIN_LENGTH = 100;

export default function AccountSuspendedPage() {
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealMessage, setAppealMessage] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealError, setAppealError] = useState("");
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const appealLength = appealMessage.trim().length;

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) { setLoading(false); return; }
    let active = true;
    getAccountStatus()
      .then((s) => { if (active) setStatus(s); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, sessionLoading]);

  async function handleSubmitAppeal(e) {
    e.preventDefault();
    if (appealLength < APPEAL_MIN_LENGTH) return;
    setAppealSubmitting(true);
    setAppealError("");
    try {
      await submitAppeal(appealMessage.trim());
      setAppealSubmitted(true);
      setAppealOpen(false);
    } catch (err) {
      setAppealError(err.message);
    } finally {
      setAppealSubmitting(false);
    }
  }

  return (
    <StaticPageLayout eyebrow="Account status" title="Your account is suspended">
      {loading ? (
        <p className="text-muted">Checking your account status…</p>
      ) : !status?.suspended ? (
        <div className="flex flex-col gap-4">
          <p>Good news — your account isn't currently suspended.</p>
          <button
            type="button"
            onClick={() => navigate("/map")}
            className="w-fit rounded-md bg-forest px-4 py-2.5 text-sm font-semibold text-white"
          >
            Back to Discover
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3 rounded border border-terracotta/40 bg-terracotta/10 p-4 text-terracotta">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-display text-base font-semibold">
                {status.indefinite ? "Suspended until further notice" : `Suspended for ${humanizeDuration(status.until)}`}
              </div>
              {!status.indefinite && status.until && (
                <div className="mt-0.5 text-[13px]">
                  Access will be restored on {new Date(status.until).toLocaleString()}.
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-1.5 font-display text-base font-semibold text-ink">Reason</h2>
            <p>{status.reason || "No reason was provided."}</p>
          </div>

          <p>
            While suspended, you can still sign in and browse TrueBites, but
            you can't save places, post reviews, or use trip planning. Take a
            look at our{" "}
            <a href="/guidelines" className="text-forest underline underline-offset-2">
              Rules and Guidelines
            </a>{" "}
            to see what leads to a suspension.
          </p>

          {appealSubmitted ? (
            <div className="rounded border border-forest/30 bg-forest/5 p-4 text-[14px] text-forest">
              Your appeal has been submitted. An admin will review it and you
              can check back here for the outcome.
            </div>
          ) : appealOpen ? (
            <form onSubmit={handleSubmitAppeal} className="flex flex-col gap-2.5 rounded border border-sand bg-white p-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Why should this suspension be reconsidered?
                </span>
                <textarea
                  value={appealMessage}
                  onChange={(e) => setAppealMessage(e.target.value)}
                  rows={5}
                  placeholder="Explain your situation — please be specific."
                  className="rounded-md border border-sand bg-chalk px-3 py-2.5 text-[14px] text-ink outline-none focus:border-forest"
                />
              </label>
              <span className={appealLength < APPEAL_MIN_LENGTH ? "text-[12px] text-muted" : "text-[12px] text-forest"}>
                {appealLength}/{APPEAL_MIN_LENGTH} characters minimum
              </span>

              {appealError && <p className="text-[13px] text-danger">{appealError}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAppealOpen(false); setAppealError(""); }}
                  disabled={appealSubmitting}
                  className="rounded-md border border-sand bg-white px-4 py-2 text-sm font-semibold text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={appealLength < APPEAL_MIN_LENGTH || appealSubmitting}
                  className="rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {appealSubmitting ? "Submitting…" : "Submit appeal"}
                </button>
              </div>
            </form>
          ) : (
            <p>
              Think it's a mistake?{" "}
              <button
                type="button"
                onClick={() => setAppealOpen(true)}
                className="text-forest underline underline-offset-2"
              >
                Submit an appeal.
              </button>
            </p>
          )}
        </div>
      )}
    </StaticPageLayout>
  );
}
