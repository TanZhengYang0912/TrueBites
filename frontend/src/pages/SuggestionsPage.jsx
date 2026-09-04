import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import DiscoveryPageShell from "../components/discovery/DiscoveryPageShell";
import DiscoveryPageIntro from "../components/discovery/DiscoveryPageIntro";
import SuggestionStatusCard from "../components/suggestions/SuggestionStatusCard";
import SuggestionForm from "../components/suggestions/SuggestionForm";
import { getMySuggestions, updateSuggestion } from "../api/suggestions";
import { getBookmarks } from "../api/engagement";
import { useSession } from "../lib/SessionContext";
import { customerSession } from "../lib/roles";
import { pageNumbers } from "../lib/pagination";

const PAGE_SIZE = 6;
const DEFAULT_PAGINATION = { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };
const DEFAULT_COUNTS = {
  types: { all: 0, vendor: 0, creator: 0 },
  statuses: { all: 0, pending: 0, published: 0, rejected: 0 },
};
const TYPE_FILTERS = [
  ["all", "Everything"],
  ["vendor", "Vendors"],
  ["creator", "Influencers / channels"],
];
const STATUS_FILTERS = ["all", "pending", "published", "rejected"];

export default function SuggestionsPage() {
  const { session } = useSession();
  const userSession = customerSession(session);
  const navigate = useNavigate();
  const location = useLocation();
  const [suggestions, setSuggestions] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [counts, setCounts] = useState(DEFAULT_COUNTS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [activeType, setActiveType] = useState("all");
  const [editingSuggestion, setEditingSuggestion] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (!userSession) {
      setSuggestions([]);
      setPagination(DEFAULT_PAGINATION);
      setCounts(DEFAULT_COUNTS);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError("");
    getMySuggestions({ page, pageSize: PAGE_SIZE, type: activeType, status: activeTab })
      .then((payload) => {
        if (!active) return;
        const nextSuggestions = payload.suggestions || [];
        setSuggestions(nextSuggestions);
        setCounts(payload.counts || DEFAULT_COUNTS);
        setPagination(payload.pagination || { ...DEFAULT_PAGINATION, total: nextSuggestions.length });
      })
      .catch((err) => { if (active) setError(err.message || "Unable to load suggestions."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userSession, page, activeType, activeTab]);

  useEffect(() => {
    if (!userSession) { setSavedCount(0); return undefined; }
    let active = true;
    getBookmarks()
      .then((b) => { if (active) setSavedCount(b.bookmarks.length); })
      .catch((err) => console.error("failed to load bookmarks:", err.message));
    return () => { active = false; };
  }, [userSession]);

  const meta = userSession?.user?.user_metadata || {};
  const email = userSession?.user?.email || "";
  const firstName = meta.first_name || "";
  const initials = firstName ? `${meta.first_name?.[0] || ""}${meta.last_name?.[0] || ""}` : email.slice(0, 2).toUpperCase() || "?";
  const submitted = Boolean(location.state?.submitted);

  const total = pagination.total || 0;
  const emptyFilterCopy = `${activeType === "all" ? "" : `${activeType} `}${activeTab === "all" ? "" : activeTab} suggestions`;
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
          savedCount,
          onOpenProfile: () => navigate("/profile"),
          onLogin: () => navigate("/login"),
          onSignUp: () => navigate("/login"),
        }}
      >
        <DiscoveryPageIntro
          eyebrow="Your community discoveries"
          title="My suggestions"
          description="Keep track of the places and creators you have shared. Every recommendation is checked by our admin team before it is published."
          action={<button type="button" onClick={() => navigate("/suggestions/new")} className="min-h-11 shrink-0 rounded bg-forest px-4 text-sm font-semibold text-white">Make a suggestion</button>}
        />

        <div className="no-scrollbar mb-7 flex snap-x items-center gap-2 overflow-x-auto scroll-smooth pb-2" data-testid="suggestion-filter-rail">
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Filter by suggestion type">
            {TYPE_FILTERS.map(([type, label]) => (
              <button key={type} type="button" aria-label={`${label} ${counts.types[type] || 0}`} aria-pressed={activeType === type} onClick={() => { setActiveType(type); setPage(1); }} className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold transition-colors ${activeType === type ? "border-forest bg-forest text-white" : "border-sand bg-white text-forest hover:border-forest"}`}>
                {label}
                <span className={activeType === type ? "text-white/80" : "text-muted"}>{counts.types[type] || 0}</span>
              </button>
            ))}
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-sand" aria-hidden="true" />

          <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Filter by suggestion status">
            {STATUS_FILTERS.map((tab) => (
              <button
                key={tab}
                type="button"
                aria-label={`${tab} ${counts.statuses[tab] || 0}`}
                aria-pressed={activeTab === tab}
                onClick={() => { setActiveTab(tab); setPage(1); }}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold capitalize transition-colors ${activeTab === tab ? "border-forest bg-forest text-white" : "border-sand bg-white text-forest hover:border-forest"}`}
              >
                {tab}
                <span className={activeTab === tab ? "text-white/80" : "text-muted"}>{counts.statuses[tab] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <p className="m-0">{total} {total === 1 ? "submission" : "submissions"} · newest first</p>
          {total > 0 && <p className="m-0 text-sm text-muted">Page {page} of {pagination.totalPages || 1}</p>}
        </div>

        {submitted && <div role="status" className="mb-6 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your suggestion is in the queue. Thanks for helping us find more of Melaka.</div>}
        {error && <div role="alert" className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="grid gap-5" aria-label="Loading suggestions"><div className="h-40 animate-pulse rounded bg-white" /><div className="h-40 animate-pulse rounded bg-white" /></div>
        ) : suggestions.length ? (
          <div className="grid gap-5">{suggestions.map((suggestion) => <SuggestionStatusCard key={suggestion.id} suggestion={suggestion} onEdit={() => setEditingSuggestion(suggestion)} />)}</div>
        ) : (
          <div className="border border-dashed border-sand bg-white px-6 py-16 text-center">
            <div className="mb-3 text-3xl">✦</div>
            <h2 className="m-0 font-display text-2xl font-medium">No suggestions {activeTab !== "all" || activeType !== "all" ? "found" : "yet"}</h2>
            <p className="mx-auto mb-5 mt-2 max-w-md text-sm leading-6 text-muted">
              {activeTab === "all" && activeType === "all"
                ? "Know a stall, kopitiam, or food creator that deserves more attention?"
                : `You don't have any ${emptyFilterCopy} at the moment.`}
            </p>
            {activeTab === "all" && activeType === "all" && <button type="button" onClick={() => navigate("/suggestions/new")} className="min-h-11 rounded-lg bg-forest px-4 text-sm font-semibold text-white">Make a suggestion</button>}
          </div>
        )}

        <SuggestionsPagination page={page} totalPages={pagination.totalPages || 1} total={total} pageSize={PAGE_SIZE} onChange={(nextPage) => { setPage(nextPage); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </DiscoveryPageShell>

      {editingSuggestion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-sand bg-white/90 p-5 backdrop-blur">
              <h2 className="m-0 font-display text-xl font-medium">Edit {editingSuggestion.suggestion_type === "creator" ? "creator" : "vendor"} suggestion</h2>
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
                    const payload = await getMySuggestions({ page, pageSize: PAGE_SIZE, type: activeType, status: activeTab });
                    setSuggestions(payload.suggestions || []);
                    setCounts(payload.counts || DEFAULT_COUNTS);
                    setPagination(payload.pagination || { ...DEFAULT_PAGINATION, total: payload.suggestions?.length || 0 });
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

const PAGE_CONTROL = "grid min-h-11 min-w-11 place-items-center rounded-md text-[13px]";
const PAGE_BUTTON = `${PAGE_CONTROL} text-forest hover:bg-sand/60 disabled:cursor-not-allowed disabled:opacity-30`;
const PAGE_NUMBER = `${PAGE_CONTROL} text-ink hover:bg-sand/60`;
const PAGE_NUMBER_ACTIVE = `${PAGE_CONTROL} bg-forest font-semibold text-white`;

function SuggestionsPagination({ page, totalPages, total, pageSize, onChange }) {
  if (totalPages <= 1) return null;
  const firstResult = ((page - 1) * pageSize) + 1;
  const lastResult = Math.min(page * pageSize, total);

  return (
    <nav className="mt-8 flex flex-col gap-3 border-t border-sand pt-4 md:flex-row md:items-center md:justify-between" aria-label="Suggestions pagination">
      <div className="text-xs text-muted">
        <span>Showing {firstResult}–{lastResult} of {total}</span>
        <span className="mx-2 hidden text-sand sm:inline" aria-hidden="true">·</span>
        <span className="hidden sm:inline">Page {page} of {totalPages}</span>
      </div>
      <div className="flex items-center justify-between gap-1 sm:justify-start">
        <button type="button" className={PAGE_BUTTON} aria-label="Previous page" disabled={page === 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <div className="hidden items-center gap-1 sm:flex">
          {pageNumbers(page, totalPages).map((item, index) => item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted" aria-hidden="true">…</span>
          ) : (
            <button key={item} type="button" className={item === page ? PAGE_NUMBER_ACTIVE : PAGE_NUMBER} aria-label={`Page ${item}`} aria-current={item === page ? "page" : undefined} onClick={() => onChange(item)}>
              {item}
            </button>
          ))}
        </div>
        <span className="px-3 text-xs font-semibold text-ink sm:hidden">Page {page} of {totalPages}</span>
        <button type="button" className={PAGE_BUTTON} aria-label="Next page" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
