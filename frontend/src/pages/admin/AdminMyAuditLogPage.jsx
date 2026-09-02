import { FileDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMyActivity } from "../../api/admin";
import { formatAuditEntry } from "../../lib/auditLogReport";
import { AUDIT_ENTITY_OPTIONS, AUDIT_PERIOD_OPTIONS, AUDIT_SORT_OPTIONS, createAuditLogQuery } from "../../lib/myAuditLogFilters";
import { openMyAuditLogPdf } from "../../lib/myAuditLogExport";
import { useSession } from "../../lib/SessionContext";

const PAGE_SIZE = 25;
const DEFAULT_FILTERS = Object.freeze({ q: "", entity: "all", period: "all", sort: "newest" });
const queryKey = (query, page, accountId) => JSON.stringify([accountId || "", page, query.q, query.entity, query.from, query.to, query.sort]);

function Pagination({ pagination, onPageChange }) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;
  return <div className="admin-pagination"><div className="admin-pagination-meta"><strong>{total}</strong> entries</div><div className="admin-pagination-controls">
    <button type="button" className="admin-secondary-btn compact" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
    <span>Page {page} / {totalPages}</span>
    <button type="button" className="admin-secondary-btn compact" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
  </div></div>;
}

// Read-only — every action the signed-in admin has personally taken.
export default function AdminMyAuditLogPage() {
  const { session } = useSession();
  const accountId = session?.user?.id || "";
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(() => ({ query: createAuditLogQuery(DEFAULT_FILTERS), page: 1 }));
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
  const appliedKey = useMemo(() => queryKey(applied.query, applied.page, accountId), [applied, accountId]);

  useEffect(() => () => window.clearTimeout(searchTimer.current), []);
  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    const requestedAccountId = accountId;
    const readyKey = queryKey(applied.query, applied.page, requestedAccountId);
    setData({ items: [], pagination: { page: applied.page, totalPages: 1, total: 0 } });
    setLoadState({ status: "loading", readyKey: "", error: "" });
    getMyActivity({ page: applied.page, pageSize: PAGE_SIZE, ...applied.query, signal: controller.signal })
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

  const applyFilters = (next) => setApplied({ query: createAuditLogQuery(next), page: 1 });
  const updateSearch = (event) => {
    const next = { ...filters, q: event.target.value };
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

  return <section className="admin-vendors-page">
    <div className="admin-audit-log-toolbar">
      <button type="button" className="admin-secondary-btn compact admin-audit-log-export" onClick={handleExport} disabled={exportDisabled}><FileDown size={14} />{exporting ? "Preparing PDF…" : "Export PDF"}</button>
      <div className="admin-audit-log-filters">
        <label className="admin-audit-log-field admin-audit-log-search">Search<Search size={15} aria-hidden="true" /><input type="search" value={filters.q} onChange={updateSearch} placeholder="Search action, entity, or full UUID" /></label>
        <label className="admin-audit-log-field">Entity<select value={filters.entity} onChange={(event) => updateFilter("entity", event.target.value)}>{AUDIT_ENTITY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="admin-audit-log-field">Time range<select value={filters.period} onChange={(event) => updateFilter("period", event.target.value)}>{AUDIT_PERIOD_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="admin-audit-log-field">Sort order<select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}>{AUDIT_SORT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        {filtersActive ? <button type="button" className="admin-secondary-btn compact" onClick={clearFilters}>Clear filters</button> : null}
      </div>
    </div>
    {loadState.status === "error" ? <div className="admin-feedback error" role="alert">{loadState.error} <button type="button" className="admin-link-btn" onClick={() => setReload((value) => value + 1)}>Retry</button></div> : null}
    {exportError ? <div className="admin-feedback error admin-audit-log-export-error" role="alert">{exportError}</div> : null}
    <section className="admin-panel admin-table-panel"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead><tbody>
      {loadState.status === "loading" ? <tr><td colSpan="3"><div className="admin-feedback" role="status" aria-live="polite">Loading your activity…</div></td></tr> : items.length ? items.map((entry) => {
        const row = formatAuditEntry(entry);
        return <tr key={row.id ?? entry.id}><td>{row.when}</td><td>{row.action}</td><td>{row.entity}</td></tr>;
      }) : <tr><td colSpan="3"><div className="admin-empty-state" role="status">{filtersActive ? "No activity matches your filters." : "No recorded activity yet."}</div></td></tr>}
    </tbody></table></div>{isReady ? <Pagination pagination={data.pagination} onPageChange={(page) => setApplied((current) => ({ ...current, page }))} /> : null}</section>
  </section>;
}
