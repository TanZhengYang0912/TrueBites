import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DiscoveryPageShell from "../components/discovery/DiscoveryPageShell";
import DiscoveryPageIntro from "../components/discovery/DiscoveryPageIntro";
import SuggestionStatusCard from "../components/suggestions/SuggestionStatusCard";
import SuggestionForm from "../components/suggestions/SuggestionForm";
import { getMySuggestions, updateSuggestion } from "../api/suggestions";
import { useSession } from "../lib/SessionContext";
import { customerSession } from "../lib/roles";

export default function SuggestionsPage() {
  const { session } = useSession();
  const userSession = customerSession(session);
  const navigate = useNavigate();
  const location = useLocation();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [editingSuggestion, setEditingSuggestion] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!userSession) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    getMySuggestions()
      .then((payload) => { if (active) setSuggestions(payload.suggestions || []); })
      .catch((err) => { if (active) setError(err.message || "Unable to load suggestions."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userSession]);

  const meta = userSession?.user?.user_metadata || {};
  const email = userSession?.user?.email || "";
  const firstName = meta.first_name || "";
  const initials = firstName ? `${meta.first_name?.[0] || ""}${meta.last_name?.[0] || ""}` : email.slice(0, 2).toUpperCase() || "?";
  const submitted = Boolean(location.state?.submitted);

  const filteredSuggestions = suggestions.filter((suggestion) => {
    if (activeTab === "all") return true;
    if (activeTab === "published") return suggestion.status === "published";
    if (activeTab === "rejected") return ["rejected", "failed", "duplicate"].includes(suggestion.status);
    if (activeTab === "pending") return !["published", "rejected", "failed", "duplicate"].includes(suggestion.status);
    return true;
  });
  return (
    <>
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
          eyebrow="Your community discoveries"
          title="My suggestions"
          description="Track the hidden gems you have shared with TrueBites. We will keep the updates simple while our team verifies the details."
          action={<button type="button" onClick={() => navigate("/suggestions/new")} className="min-h-11 shrink-0 rounded bg-forest px-4 text-sm font-semibold text-white">Suggest another vendor</button>}
        />

        <div className="mb-6 flex gap-2 overflow-x-auto border-b border-sand pb-px">
          {["all", "pending", "published", "rejected"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold capitalize transition-colors ${activeTab === tab ? "border-forest text-ink" : "border-transparent text-muted hover:border-sand hover:text-ink"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {submitted && <div role="status" className="mb-6 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your suggestion is in the queue. Thanks for helping us find more of Melaka.</div>}
        {error && <div role="alert" className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="grid gap-4" aria-label="Loading suggestions"><div className="h-40 animate-pulse bg-white" /><div className="h-40 animate-pulse bg-white" /></div>
        ) : filteredSuggestions.length ? (
          <div className="grid gap-5">{filteredSuggestions.map((suggestion) => <SuggestionStatusCard key={suggestion.id} suggestion={suggestion} onEdit={() => setEditingSuggestion(suggestion)} />)}</div>
        ) : (
          <div className="border border-dashed border-sand bg-white px-6 py-16 text-center">
            <div className="mb-3 text-3xl">✦</div>
            <h2 className="m-0 font-display text-2xl font-medium">No suggestions {activeTab !== "all" ? "found" : "yet"}</h2>
            <p className="mx-auto mb-5 mt-2 max-w-md text-sm leading-6 text-muted">
              {activeTab === "all" 
                ? "Know a stall, kopitiam, or family-run spot that deserves more attention?"
                : `You don't have any ${activeTab} suggestions at the moment.`}
            </p>
            {activeTab === "all" && <button type="button" onClick={() => navigate("/suggestions/new")} className="min-h-11 rounded bg-forest px-4 text-sm font-semibold text-white">Share a hidden gem</button>}
          </div>
        )}
      </DiscoveryPageShell>

      {editingSuggestion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-sand bg-white/90 p-5 backdrop-blur">
              <h2 className="m-0 font-display text-xl font-medium">Edit Suggestion</h2>
              <button type="button" onClick={() => setEditingSuggestion(null)} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
            <div className="p-5">
              <SuggestionForm 
                initialValues={editingSuggestion}
                submitting={isUpdating}
                onSubmit={async (values) => {
                  setIsUpdating(true);
                  try {
                    await updateSuggestion(editingSuggestion.id, values);
                    const payload = await getMySuggestions();
                    setSuggestions(payload.suggestions || []);
                    setEditingSuggestion(null);
                  } catch (err) {
                    alert(err.message || "Unable to update.");
                  } finally {
                    setIsUpdating(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
