const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function AdminPagination({ pagination, pageSize, onPageChange, onPageSizeChange, itemLabel = "vendors", ariaLive = false }) {
  const { page, totalPages, total } = pagination;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const label = total === 1 && itemLabel === "entries" ? "entry" : itemLabel;
  return (
    <div className="admin-pagination">
      <div className="admin-pagination-meta" aria-live={ariaLive ? "polite" : undefined}>
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> {label}
      </div>
      <div className="admin-pagination-controls">
        <label className="admin-page-size">
          Rows
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" className="admin-secondary-btn compact" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span>Page {page} / {totalPages}</span>
        <button type="button" className="admin-secondary-btn compact" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
