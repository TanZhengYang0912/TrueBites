import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import DiscoveryPageShell from "../components/discovery/DiscoveryPageShell";
import DiscoveryPageIntro from "../components/discovery/DiscoveryPageIntro";
import SuggestionForm from "../components/suggestions/SuggestionForm";
import { createSuggestion } from "../api/suggestions";
import { useSession } from "../lib/SessionContext";
import { customerSession } from "../lib/roles";

export default function SuggestionFormPage() {
  const { session } = useSession();
  const userSession = customerSession(session);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(values) {
    setSubmitting(true);
    setServerErrors({});
    setErrorMessage("");
    try {
      await createSuggestion(values);
      navigate("/suggestions", { replace: true, state: { submitted: true } });
    } catch (error) {
      setServerErrors(error.payload?.fields || {});
      setErrorMessage(error.payload?.error || error.message || "Unable to send your suggestion.");
    } finally {
      setSubmitting(false);
    }
  }

  const meta = userSession?.user?.user_metadata || {};
  const email = userSession?.user?.email || "";
  const firstName = meta.first_name || "";
  const initials = firstName ? `${meta.first_name?.[0] || ""}${meta.last_name?.[0] || ""}` : email.slice(0, 2).toUpperCase() || "?";

  return (
    <DiscoveryPageShell
      headerProps={{
        session: userSession,
        userEmail: email,
        initials,
        firstName,
        avatarUrl: meta.avatar_url || "",
        activeSection: "suggestions",
        onOpenDiscover: () => navigate("/map"),
        onOpenSaved: () => navigate("/engagement"),
        onOpenReviews: () => navigate("/engagement?tab=reviews"),
        onOpenSuggestions: () => navigate("/suggestions"),
        onOpenProfile: () => navigate("/profile"),
        onOpenMap: () => navigate("/map?view=map"),
        onLogin: () => navigate("/login"),
        onSignUp: () => navigate("/login"),
      }}
    >
      <DiscoveryPageIntro
        eyebrow="Community discoveries · Melaka only"
        title="Share the place locals keep to themselves."
        description="Send us a vendor and a video. Our admin team checks every suggestion before it becomes part of the TrueBites guide."
        action={<button type="button" onClick={() => navigate("/suggestions")} className="min-h-11 shrink-0 rounded bg-forest px-4 text-sm font-semibold text-white">My suggestions</button>}
      />

        <section className="border border-sand bg-white p-5 shadow-[0_16px_40px_rgba(54,61,65,0.06)] md:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-white">
              <Lightbulb size={20} />
            </div>
            <div>
              <h2 className="m-0 font-display text-2xl font-medium">Suggest a hidden gem</h2>
              <p className="mb-0 mt-1 text-sm text-muted">A few useful details help the team verify the right place.</p>
            </div>
          </div>
          {errorMessage && <div role="alert" className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
          <SuggestionForm onSubmit={handleSubmit} submitting={submitting} serverErrors={serverErrors} />
        </section>
    </DiscoveryPageShell>
  );
}
