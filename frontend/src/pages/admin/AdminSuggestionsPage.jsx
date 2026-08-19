import { useEffect, useState } from "react";
import { Lightbulb, RefreshCw, Search, Eye, Pencil } from "lucide-react";
import { getAdminSuggestion, getAdminSuggestions, updateAdminSuggestionsBatch } from "../../api/admin";
import SuggestionDetailModal from "../../components/admin/SuggestionDetailModal";

const STATUS_OPTIONS = [
  ["all", "All statuses"],
  ["submitted", "Submitted"],
  ["under_review", "Under review"],
  ["needs_info", "Needs information"],
  ["processing", "Processing"],
  ["admin_review", "Admin review"],
  ["draft_created", "Draft created"],
  ["published", "Published"],
  ["duplicate", "Duplicate"],
  ["rejected", "Rejected"],
  ["failed", "Failed"],
];

export default function AdminSuggestionsPage() {
  const [data, setData] = useState({ suggestions: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } });
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchBusy, setBatchBusy] = useState(false);

  async function load(page = data.pagination.page) {
    setLoading(true);
    setError("");
    setSelectedIds([]); // clear selection when loading new page
    try {
      setData(await getAdminSuggestions({ page, pageSize: 10, status, q: query }));
    } catch (loadError) {
      setError(loadError.message || "Unable to load community suggestions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); /* filters are intentionally applied on submit/change */ }, [status, query]);

  async function openSuggestion(id) {
    try {
      const payload = await getAdminSuggestion(id);
      setSelected(payload.suggestion);
    } catch (loadError) {
      setError(loadError.message || "Unable to load suggestion details.");
    }
  }

  function handleChanged(next) {
    setSelected((current) => current ? { ...current, ...next } : current);
    load(data.pagination.page);
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(data.suggestions.map(s => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (e, id) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  async function handleBatchAction(nextStatus) {
    if (!selectedIds.length) return;
    if (!window.confirm(`Are you sure you want to mark ${selectedIds.length} suggestions as ${nextStatus}?`)) return;

    setBatchBusy(true);
    setError("");
    try {
      await updateAdminSuggestionsBatch(selectedIds, nextStatus);
      setSelectedIds([]);
      load(data.pagination.page);
    } catch (e) {
      setError(e.message || "Batch action failed.");
    } finally {
      setBatchBusy(false);
    }
  }

  const allSelected = data.suggestions.length > 0 && selectedIds.length === data.suggestions.length;

  return (
    <div className="grid gap-5">
      <section className="border border-sand bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-white"><Lightbulb size={20} /></div>
            <div>
              <p className="mb-1 mt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-terracotta">Customer contribution queue</p>
              <h2 className="m-0 font-display text-3xl font-medium text-ink">Community suggestions</h2>
              <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-muted">Review Malacca hidden-gem submissions before they enter the AI content workflow or vendor catalogue.</p>
            </div>
          </div>
          <button type="button" onClick={() => load(data.pagination.page)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-sand px-3 text-sm font-semibold text-ink hover:border-blue-600 hover:text-blue-600"><RefreshCw size={15} /> Refresh</button>
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex h-10 w-full flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 shadow-sm focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300 lg:max-w-2xl">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(search.trim()); }} placeholder="Search vendor name" aria-label="Search suggestions" className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter suggestion status" className="h-10 appearance-none rounded-full border border-gray-200 bg-white pl-4 pr-10 text-sm font-semibold text-blue-600 shadow-sm outline-none transition-colors hover:bg-gray-50 focus:border-gray-300 focus:ring-1 focus:ring-gray-300">
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
          <button type="button" onClick={() => setQuery(search.trim())} className="inline-flex h-10 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700">Apply filters</button>
        </div>
      </div>

      {error && <div role="alert" className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 shadow-sm">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.length} suggestion(s) selected</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={batchBusy} onClick={() => handleBatchAction("under_review")} className="min-h-9 rounded bg-forest px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50 hover:bg-forest/90">Start review</button>
            <button type="button" disabled={batchBusy} onClick={() => handleBatchAction("duplicate")} className="min-h-9 rounded border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 transition-colors disabled:opacity-50 hover:bg-blue-100">Mark as duplicate</button>
            <button type="button" disabled={batchBusy} onClick={() => handleBatchAction("rejected")} className="min-h-9 rounded border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition-colors disabled:opacity-50 hover:bg-red-50">Reject</button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-gray-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-4 w-12 text-center">
                  <input type="checkbox" checked={allSelected} onChange={handleSelectAll} className="size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                </th>
                <th className="px-6 py-4">Vendor</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan="7" className="px-6 py-14 text-center"><div className="mx-auto h-4 w-1/3 animate-pulse rounded bg-gray-100" /></td></tr> : data.suggestions.length ? data.suggestions.map((suggestion) => (
                <tr key={suggestion.id} className={`group cursor-pointer transition-colors ${selectedIds.includes(suggestion.id) ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-gray-50'}`} onClick={() => openSuggestion(suggestion.id)}>
                  <td className="px-6 py-4 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.includes(suggestion.id)} onChange={(e) => handleSelectOne(e, suggestion.id)} className="size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                  </td>
                  <td className="px-6 py-4"><strong className="block font-bold text-gray-900">{suggestion.vendor_name}</strong><span className="text-xs text-gray-500">{suggestion.category || "Category not provided"}</span></td>
                  <td className="px-6 py-4 text-gray-500">{suggestion.location_text}</td>
                  <td className="px-6 py-4 text-gray-500">{suggestion.source_platform}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${["rejected", "duplicate", "failed"].includes(suggestion.status) ? "bg-red-100 text-red-700" :
                        ["published", "draft_created"].includes(suggestion.status) ? "bg-emerald-100 text-emerald-700" :
                          ["accepted_for_processing", "processing", "admin_review"].includes(suggestion.status) ? "bg-blue-100 text-blue-700" :
                            ["under_review", "needs_info"].includes(suggestion.status) ? "bg-amber-100 text-amber-700" :
                              "bg-gray-100 text-gray-600"
                      }`}>
                      {suggestion.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{new Date(suggestion.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => openSuggestion(suggestion.id)} className="inline-flex size-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700" aria-label="Review suggestion" title={["published", "rejected", "duplicate"].includes(suggestion.status) ? "View details" : "Review suggestion"}>
                      {["published", "rejected", "duplicate"].includes(suggestion.status) ? <Eye size={16} /> : <Pencil size={16} />}
                    </button>
                  </td>
                </tr>
              )) : <tr><td colSpan="7" className="px-6 py-14 text-center"><div className="text-3xl text-gray-300">✦</div><p className="mb-0 mt-2 font-display text-xl text-gray-900">No suggestions in this view</p><p className="mb-0 mt-1 text-sm text-gray-500">New customer submissions will appear here.</p></td></tr>}
            </tbody>
          </table>
        </div>
        {data.pagination.totalPages > 1 && <div className="flex items-center justify-between border-t border-gray-100 bg-white px-6 py-4 text-sm text-gray-500"><span>{data.pagination.total} suggestions</span><div className="flex gap-2"><button type="button" disabled={data.pagination.page <= 1} onClick={() => load(data.pagination.page - 1)} className="min-h-9 rounded border border-gray-200 px-3 transition-colors hover:bg-gray-50 disabled:opacity-40">Previous</button><span className="px-2 py-2">Page {data.pagination.page} of {data.pagination.totalPages}</span><button type="button" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => load(data.pagination.page + 1)} className="min-h-9 rounded border border-gray-200 px-3 transition-colors hover:bg-gray-50 disabled:opacity-40">Next</button></div></div>}
      </section>

      {selected && <SuggestionDetailModal suggestion={selected} onClose={() => setSelected(null)} onChanged={handleChanged} />}
    </div>
  );
}
