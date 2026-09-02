import { openPdfPreview } from './pdfPreview.js';

// "vendor.create" -> "Vendor create"
function formatAction(action) {
  const spaced = String(action || "").replace(/[._]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatEntity(entry) {
  if (!entry.entityType) return "—";
  return entry.entityId ? `${entry.entityType} · ${entry.entityId}` : entry.entityType;
}

// Paginated admin endpoints cap pageSize server-side (see admin.js), so
// exporting "everything" means walking every page rather than trusting one
// request to return it all. `params` is forwarded to fetchPage alongside
// page/pageSize — used to carry the current filters (status, category,
// search, sort) so an export matches what's on screen.
export async function fetchAllPages(fetchPage, { pageSize = 100, params = {} } = {}) {
  let page = 1;
  let all = [];
  while (true) {
    const payload = await fetchPage({ page, pageSize, ...params });
    all = all.concat(payload.items || []);
    const totalPages = payload.pagination?.totalPages || 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return all;
}

// TrueBites header (wordmark, title, subtitle, generated timestamp) shared
// by every export in this file. Returns the y cursor to continue from.
function drawPdfHeader(doc, { title, subtitle, marginX, meta }) {
  let y = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(64, 84, 74); // forest
  doc.text("TrueBites", marginX, y);
  y += 22;

  doc.setFontSize(13);
  doc.setTextColor(20, 26, 33); // ink
  doc.text(title, marginX, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(105, 113, 122); // muted
  if (subtitle) {
    doc.text(subtitle, marginX, y);
    y += 14;
  }
  doc.text(`Generated ${new Date().toLocaleString()}${meta ? ` · ${meta}` : ""}`, marginX, y);
  y += 10;

  return y;
}

// Shared table export (TrueBites header + one autoTable) — both list-style
// export functions below build on this. Opens the result in a new tab via a
// blob: URL so the browser's own PDF viewer previews it, rather than
// forcing a download.
//
// jsPDF/autotable are dynamically imported so their ~140KB (gzipped) only
// loads when an admin actually exports something, instead of shipping in
// every visitor's initial bundle — this app has no route-based code
// splitting yet, so a static import here would land in the main chunk.
async function buildAndOpenPdf({ title, subtitle, head, rows, emptyRow, countLabel }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "pt", orientation: rows.length && head.length > 4 ? "landscape" : "portrait" });
  const marginX = 40;
  const y = drawPdfHeader(doc, { title, subtitle, marginX, meta: countLabel });

  autoTable(doc, {
    startY: y + 10,
    head: [head],
    body: rows.length ? rows : [emptyRow],
    styles: { fontSize: 9, cellPadding: 6, textColor: [32, 42, 53] },
    headStyles: { fillColor: [64, 84, 74], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [250, 248, 244] }, // chalk
    margin: { left: marginX, right: marginX },
  });

  window.open(doc.output("bloburl"), "_blank");
}

export async function openActivityLogPdf({ title, subtitle, entries }) {
  return buildAndOpenPdf({
    title,
    subtitle,
    head: ["When", "Action", "Entity"],
    rows: entries.map((entry) => [
      new Date(entry.createdAt).toLocaleString(),
      formatAction(entry.action),
      formatEntity(entry),
    ]),
    emptyRow: ["—", "No recorded activity", "—"],
    countLabel: `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`,
  });
}

export async function openVendorsPdf({ title, subtitle, vendors }) {
  return buildAndOpenPdf({
    title,
    subtitle,
    head: ["Name", "Category", "Status", "Location", "Price Range", "Joined"],
    // `location` (from firstLocation() in admin.js) is deliberately just the
    // first comma-delimited fragment of the address — short enough for the
    // admin table's narrow column. The PDF has no such width constraint, so
    // it uses the vendor's full address instead; `location` is only a
    // fallback for the rare row where fullAddress itself is empty.
    rows: vendors.map((v) => [
      v.name || "—",
      v.category || "—",
      v.status || "—",
      v.fullAddress || v.location || "—",
      v.priceRange || "—",
      v.joined ? new Date(v.joined).toLocaleDateString() : "—",
    ]),
    emptyRow: ["—", "No vendors matched this filter", "—", "—", "—", "—"],
    countLabel: `${vendors.length} vendor${vendors.length === 1 ? "" : "s"}`,
  });
}

export async function openSuggestionsPdf({ title, subtitle, suggestions }) {
  return buildAndOpenPdf({
    title,
    subtitle,
    head: ["Suggestion", "Type", "Focus / category", "Context", "Status", "Submitted"],
    rows: suggestions.map((suggestion) => [
      suggestion.suggestion_type === "creator" ? suggestion.creator_name || "—" : suggestion.vendor_name || "—",
      suggestion.suggestion_type === "creator" ? "Creator" : "Vendor",
      suggestion.suggestion_type === "creator" ? suggestion.creator_focus || "—" : suggestion.category || "—",
      suggestion.suggestion_type === "creator" ? suggestion.creator_audience || "—" : suggestion.location_text || "—",
      String(suggestion.status || "—").replace(/_/g, " "),
      suggestion.created_at ? new Date(suggestion.created_at).toLocaleDateString() : "—",
    ]),
    emptyRow: ["—", "—", "—", "—", "No suggestions selected", "—"],
    countLabel: `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`,
  });
}

// Reserve the preview during the user's click, before lazy imports/font loading
// can lose the browser's transient user activation. Snapshot before any await.
export async function openOverviewPdf(report) {
  const snapshot = structuredClone(report);
  return openPdfPreview(async () => {
    const { createDashboardPdf } = await import('./dashboardPdf.js');
    return createDashboardPdf(snapshot);
  }, {
    preparing: 'Preparing your dashboard PDF…',
    errorMessage: 'Could not prepare the dashboard PDF. Please try again. If it persists, contact support.',
  });
}
