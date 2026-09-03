import { FileDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMyActivity } from "../../api/admin";
import AdminPagination from "../../components/admin/AdminPagination";
import { formatAuditEntry } from "../../lib/auditLogReport";
import { AUDIT_ENTITY_OPTIONS, AUDIT_PERIOD_OPTIONS, AUDIT_SORT_OPTIONS, createAuditLogQuery } from "../../lib/myAuditLogFilters";
import { openMyAuditLogPdf } from "../../lib/myAuditLogExport";
import { useSession } from "../../lib/SessionContext";
import "./auditMobileFilters.css";

const DEFAULT_FILTERS = Object.freeze({ q: "", entity: "all", period: "all", sort: "newest" });
const queryKey = (query, page, pageSize, accountId) => JSON.stringify([accountId || "", page, pageSize, query.q, query.entity, query.from, query.to, query.sort]);

function AuditFilterSelect({ label, value, options, onChange }) {
  return <div className="audit-filter-select relative">
    <select aria-label={label} className="h-10 appearance-none rounded-full border border-gray-200 bg-white pl-4 pr-10 text-sm font-semibold text-blue-600 shadow-sm outline-none hover:bg-gray-50 focus:border-gray-300 focus:ring-1 focus:ring-gray-300" value={value} onChange={onChange}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
    </div>
  </div>;
}

// Read-only — every action the signed-in admin has personally taken.
export default function AdminMyAuditLogPage() {
  const [isPhoneFilters, setIsPhoneFilters] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(width < 768px)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(width < 768px)");
    const update = () => setIsPhoneFilters(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const { session } = useSession();
  const accountId = session?.user?.id || "";
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(() => ({ query: createAuditLogQuery(DEFAULT_FILTERS), page: 1, pageSize: 10 }));
  const [reload, setReload] = useState(0);
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loadState, setLoadState] = useState({ status: "loading", readyKey: "", error: "" });
  const [searchPending, setSearchPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const searchTimer = useRef(null);
  const requestId = useRef(0);
  const exportGuard = useRef(false);
  const exportController = useRef(null);
  const appliedKey = useMemo(() => queryKey(applied.query, applied.page, applied.pageSize, accountId), [applied, accountId]);

  useEffect(() => () => window.clearTimeout(searchTimer.current), []);
  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    const requestedAccountId = accountId;
    const readyKey = queryKey(applied.query, applied.page, applied.pageSize, requestedAccountId);
    setData({ items: [], pagination: { page: applied.page, totalPages: 1, total: 0 } });
    setLoadState({ status: "loading", readyKey: "", error: "" });
    getMyActivity({ page: applied.page, pageSize: applied.pageSize, ...applied.query, signal: controller.signal })
      .then((payload) => {
        if (id !== requestId.current || requestedAccountId !== accountIdRef.current) return;
        setData(payload);
        setLoadState({ status: "ready", readyKey, error: "" });
      })
      .catch((err) => {
        if (controller.signal.aborted || id !== requestId.current || requestedAccountId !== accountIdRef.current) return;
        setLoadState({ status: "error", readyKey: "", error: err.message || "Could not load your activity." });
      });
    return () => controller.abort();
  }, [applied, accountId, reload]);
  useEffect(() => () => {
    exportController.current?.abort();
    exportController.current = null;
  }, [accountId]);

  const applyFilters = (next) => setApplied((current) => ({ ...current, query: createAuditLogQuery(next), page: 1 }));
  const updateSearch = (event) => {
    const next = { ...filters, q: event.target.value.slice(0, 100) };
    setFilters(next);
    window.clearTimeout(searchTimer.current);
    setSearchPending(true);
    searchTimer.current = window.setTimeout(() => { applyFilters(next); setSearchPending(false); }, 350);
  };
  const updateFilter = (name, value) => {
    const next = { ...filters, [name]: value };
    setFilters(next);
    window.clearTimeout(searchTimer.current);
    setSearchPending(false);
    applyFilters(next);
  };
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setFilters(DEFAULT_FILTERS); setSearchPending(false); applyFilters(DEFAULT_FILTERS);
  };
  const isReady = loadState.status === "ready" && loadState.readyKey === appliedKey;
  const filtersActive = filters.q !== "" || filters.entity !== "all" || filters.period !== "all" || filters.sort !== "newest";
  const exportDisabled = searchPending || !isReady || exporting;
  const items = data.items || [];

  async function handleExport() {
    if (exportGuard.current || exportDisabled) return;
    exportGuard.current = true;
    const controller = new AbortController();
    exportController.current = controller;
    const snapshot = { ...applied.query };
    setExporting(true); setExportError("");
    try {
      await openMyAuditLogPdf(getMyActivity, { signal: controller.signal, query: snapshot });
    } catch (err) {
      if (!controller.signal.aborted) setExportError(err?.message || "Could not prepare your audit log PDF. Please try again.");
    } finally {
      if (exportController.current === controller) exportController.current = null;
      exportGuard.current = false;
      setExporting(false);
    }
  }

  const clearControl = filtersActive ? <button key="clear" type="button" className="audit-filter-clear inline-flex h-10 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-blue-600 shadow-sm hover:bg-gray-50" onClick={clearFilters}>Clear filters</button> : null;
  const exportControl = <button key="export" type="button" className="audit-filter-export inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-blue-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60" onClick={handleExport} disabled={exportDisabled}><FileDown size={16} aria-hidden="true" /><span>{exporting ? "Preparing PDF…" : "Export PDF"}</span></button>;

  return <section className="admin-vendors-page flex flex-col gap-6">
    <div className="admin-audit-log-toolbar flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="audit-filter-search flex h-10 w-full min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 shadow-sm focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300 max-lg:h-11 xl:max-w-2xl">
        <Search size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
        <input aria-label="Search" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" type="search" maxLength={100} value={filters.q} onChange={updateSearch} placeholder="Search action, entity, or full UUID" />
      </div>
      <div className="audit-filter-controls flex flex-wrap items-center gap-3">
        <AuditFilterSelect label="Entity" value={filters.entity} options={AUDIT_ENTITY_OPTIONS} onChange={(event) => updateFilter("entity", event.target.value)} />
        <AuditFilterSelect label="Time range" value={filters.period} options={AUDIT_PERIOD_OPTIONS} onChange={(event) => updateFilter("period", event.target.value)} />
        <AuditFilterSelect label="Sort order" value={filters.sort} options={AUDIT_SORT_OPTIONS} onChange={(event) => updateFilter("sort", event.target.value)} />
        {isPhoneFilters ? [exportControl, clearControl] : [clearControl, exportControl]}
      </div>
    </div>
    {loadState.status === "error" ? <div className="admin-feedback error" role="alert">{loadState.error} <button type="button" className="admin-link-btn" onClick={() => setReload((value) => value + 1)}>Retry</button></div> : null}
    {exportError ? <div className="admin-feedback error admin-audit-log-export-error" role="alert">{exportError}</div> : null}
    <section className="admin-panel admin-table-panel"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead><tbody>
      {loadState.status === "loading" ? <tr><td colSpan="3"><div className="admin-feedback" role="status" aria-live="polite">Loading your activity…</div></td></tr> : loadState.status === "error" ? <tr><td colSpan="3"><div className="admin-feedback" role="status">Could not load activity. Use Retry above.</div></td></tr> : items.length ? items.map((entry) => {
        const row = formatAuditEntry(entry);
        return <tr key={row.id ?? entry.id}><td>{row.when}</td><td>{row.action}</td><td>{row.entity}</td></tr>;
      }) : <tr><td colSpan="3"><div className="admin-empty-state" role="status">{filtersActive ? "No activity matches your filters." : "No recorded activity yet."}</div></td></tr>}
    </tbody></table></div>{isReady ? <AdminPagination pagination={data.pagination} pageSize={applied.pageSize} onPageChange={(page) => setApplied((current) => ({ ...current, page }))} onPageSizeChange={(pageSize) => setApplied((current) => ({ ...current, pageSize, page: 1 }))} itemLabel="entries" ariaLive /> : null}</section>
  </section>;
}
