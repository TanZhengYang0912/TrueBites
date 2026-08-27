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

function hexToRgb(hex) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Draws a legend (color swatch + label + value) as jsPDF vector content —
// required whenever a chart has 2+ series, per the dataviz skill.
function drawLegend(doc, { x, y, items, colors, rowHeight = 18 }) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  items.forEach((item, i) => {
    const rowY = y + i * rowHeight;
    const [r, g, b] = hexToRgb(colors[i % colors.length]);
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, rowY - 8, 10, 10, 2, 2, "F");
    doc.setTextColor(20, 26, 33);
    doc.text(String(item.label), x + 16, rowY);
    doc.setTextColor(105, 113, 122);
    doc.text(String(item.value), x + 150, rowY);
  });
  return y + items.length * rowHeight;
}

// Adds a new page and resets the cursor if the next block wouldn't fit —
// keeps the report from clipping content at a page boundary.
function ensureSpace(doc, y, needed, marginX) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - 40) return y;
  doc.addPage();
  return drawPdfHeader(doc, { title: "Admin Overview (cont.)", marginX });
}

// The admin Overview page as a PDF report: KPI summary table, a status
// breakdown pie chart, and bar charts for the other breakdowns — charts are
// rendered to PNG via Canvas (see lib/chartCanvas.js) and embedded as
// images since jsPDF has no native charting.
export async function openOverviewPdf({ kpis = [], statusBreakdown = [], categoryBreakdown = [], sourceBreakdown = [], aiPipeline = [] }) {
  const [{ jsPDF }, { default: autoTable }, { renderBarChartPng, renderPieChartPng }, { CATEGORICAL, colorsForBreakdown }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    import("./chartCanvas.js"),
    import("./chartColors.js"),
  ]);

  const doc = new jsPDF({ unit: "pt" });
  const marginX = 40;
  let y = drawPdfHeader(doc, { title: "Admin Overview", subtitle: "Operations snapshot", marginX });

  if (kpis.length) {
    autoTable(doc, {
      startY: y + 10,
      head: [["Metric", "Value", "Note"]],
      body: kpis.map((k) => [k.label, `${k.value}${k.suffix || ""}`, k.note || "—"]),
      styles: { fontSize: 9.5, cellPadding: 6, textColor: [32, 42, 53] },
      headStyles: { fillColor: [64, 84, 74], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [250, 248, 244] },
      margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 30;
  }

  if (statusBreakdown.length) {
    y = ensureSpace(doc, y, 260, marginX);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 26, 33);
    doc.text("Vendor status", marginX, y);
    y += 14;

    const pieColors = colorsForBreakdown(statusBreakdown);
    const pieSize = 200;
    const pieUrl = renderPieChartPng({ data: statusBreakdown, colors: pieColors, size: pieSize });
    doc.addImage(pieUrl, "PNG", marginX, y, pieSize, pieSize);
    drawLegend(doc, { x: marginX + pieSize + 30, y: y + 30, items: statusBreakdown, colors: pieColors });
    y += pieSize + 30;
  }

  const barCharts = [
    { title: "Vendor categories", data: categoryBreakdown },
    { title: "Source mix", data: sourceBreakdown },
    { title: "AI content pipeline", data: aiPipeline },
  ].filter((chart) => chart.data.length);

  for (const chart of barCharts) {
    y = ensureSpace(doc, y, 300, marginX);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 26, 33);
    doc.text(chart.title, marginX, y);
    y += 14;

    const colors = colorsForBreakdown(chart.data).map((c, i) => c || CATEGORICAL[i % CATEGORICAL.length]);
    const chartWidth = doc.internal.pageSize.getWidth() - marginX * 2;
    const chartHeight = 240;
    const url = renderBarChartPng({ data: chart.data, colors, width: chartWidth, height: chartHeight });
    doc.addImage(url, "PNG", marginX, y, chartWidth, chartHeight);
    y += chartHeight + 30;
  }

  window.open(doc.output("bloburl"), "_blank");
}
