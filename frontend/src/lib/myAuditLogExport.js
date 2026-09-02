import { fetchAllPages } from './exportPdf.js';
import { buildAuditLogReport } from './auditLogReport.js';
import { openPdfPreview } from './pdfPreview.js';

function snapshotQuery(query = {}) {
  return Object.freeze({
    q: String(query.q ?? ''), entity: String(query.entity ?? 'all'),
    from: String(query.from ?? ''), to: String(query.to ?? ''), sort: String(query.sort ?? 'newest'),
  });
}

export function openMyAuditLogPdf(fetchPage, { signal, query } = {}) {
  const snapshot = snapshotQuery(query);
  return openPdfPreview(async (isClosed) => {
    const entries = await fetchAllPages(async (options) => {
      if (isClosed()) throw new Error('Preview closed');
      return fetchPage({ ...options, signal });
    }, { pageSize: 100, params: snapshot });
    if (isClosed()) return null;
    // Do not pass raw audit metadata to font inspection or PDF rendering.
    const report = buildAuditLogReport(entries, new Date(), snapshot);
    const { createAuditLogPdf } = await import('./auditLogPdf.js');
    return createAuditLogPdf(report);
  }, {
    signal,
    preparing: 'Preparing your personal audit log PDF…',
    errorMessage: 'Could not prepare your audit log PDF. Please try again.',
  });
}
