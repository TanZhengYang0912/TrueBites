import { createPdfText } from './dashboardPdfText.js';
import { DASHBOARD_COLORS as COLOR } from './dashboardReport.js';

const MARGIN = 28;
const TABLE_TOP = 112;
const HEADER_HEIGHT = 29;
const LINE = 12;
const PADDING = 10;

// A printable table of the display-only report, never the raw audit payload.
export function renderAuditLogPdf(doc, report) {
  const { draw, wrap, drawLines } = createPdfText(doc);
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const tableWidth = width - MARGIN * 2;
  const bottom = height - 48;
  const bodyTop = TABLE_TOP + HEADER_HEIGHT;
  const columns = [
    { key: 'when', label: 'When', width: tableWidth * 0.23 },
    { key: 'action', label: 'Action', width: tableWidth * 0.30 },
    { key: 'entity', label: 'Entity', width: tableWidth * 0.47 },
  ];
  let y = bodyTop;

  function pageHeader() {
    doc.setFillColor(COLOR.background); doc.rect(0, 0, width, height, 'F');
    draw('TrueBites', MARGIN, 38, 14, COLOR.blue, true);
    draw(report.title, MARGIN, 64, 19, COLOR.ink, true);
    draw(report.subtitle, MARGIN, 83, 9, COLOR.muted);
    draw(report.generated, MARGIN, 100, 8, COLOR.muted);
    draw(`${report.count} ${report.count === 1 ? 'entry' : 'entries'}`, width - MARGIN, 100, 8, COLOR.muted, false, { align: 'right' });
    doc.setFillColor(COLOR.track); doc.rect(MARGIN, TABLE_TOP, tableWidth, HEADER_HEIGHT, 'F');
    let x = MARGIN;
    columns.forEach((column) => {
      draw(column.label, x + PADDING, TABLE_TOP + 19, 8.5, COLOR.muted, true);
      x += column.width;
    });
    doc.setDrawColor(COLOR.border); doc.setLineWidth(0.6);
    doc.line(MARGIN, bodyTop, width - MARGIN, bodyTop);
    y = bodyTop;
  }

  function nextPage() { doc.addPage(); pageHeader(); }

  function rowFragment(blocks, count, alternate) {
    const rowHeight = Math.max(36, count * LINE + PADDING * 2);
    doc.setFillColor(alternate ? '#FAFBFD' : COLOR.panel);
    doc.rect(MARGIN, y, tableWidth, rowHeight, 'F');
    let x = MARGIN;
    blocks.forEach((block, index) => {
      drawLines(block, x + PADDING, y + PADDING + 9, index === 2 ? COLOR.muted : COLOR.ink, count, LINE);
      block.lines = block.lines.slice(count);
      x += columns[index].width;
    });
    y += rowHeight;
    doc.setDrawColor(COLOR.border); doc.setLineWidth(0.6);
    doc.line(MARGIN, y, width - MARGIN, y);
    doc.line(MARGIN, y - rowHeight, MARGIN, y);
    doc.line(width - MARGIN, y - rowHeight, width - MARGIN, y);
  }

  pageHeader();
  const rows = report.rows.length ? report.rows : [{ when: '—', action: 'No recorded activity', entity: '—' }];
  rows.forEach((row, index) => {
    const blocks = columns.map((column) => wrap(row[column.key], column.width - PADDING * 2, 9));
    let remaining = Math.max(1, ...blocks.map((block) => block.lines.length));
    // Keep a normal row together. Split only if it exceeds an entire page body.
    const wholeHeight = Math.max(36, remaining * LINE + PADDING * 2);
    if (y + wholeHeight > bottom && wholeHeight <= bottom - bodyTop) nextPage();
    do {
      if (y + 36 > bottom) nextPage();
      const capacity = Math.floor((bottom - y - PADDING * 2) / LINE);
      const count = Math.min(remaining, capacity);
      rowFragment(blocks, count, index % 2 === 1);
      remaining -= count;
      if (remaining > 0) nextPage();
    } while (remaining > 0);
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    draw('TrueBites · My Audit Log', MARGIN, height - 22, 8, COLOR.muted);
    draw(`${page} / ${pages}`, width - MARGIN, height - 22, 8, COLOR.muted, false, { align: 'right' });
  }
  doc.setProperties({ title: 'TrueBites - My Audit Log', subject: `${report.count} personal audit entries`, author: 'TrueBites' });
  return doc;
}

export async function createAuditLogPdf(report) {
  const [{ jsPDF }, { installDashboardFonts }] = await Promise.all([import('jspdf'), import('./dashboardPdfFonts.js')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true, putOnlyUsedFonts: true });
  await installDashboardFonts(doc, report);
  return renderAuditLogPdf(doc, report);
}
