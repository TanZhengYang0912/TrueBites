import { DASHBOARD_COPY as COPY, DASHBOARD_COLORS as COLOR, TREND_SERIES, barTone, chartMaximum, chartPoints } from './dashboardReport.js';
import { statusToneFor } from './adminDashboard.js';
import { createPdfText } from './dashboardPdfText.js';

const MARGIN = 24;
const GAP = 12;
const BODY_BOTTOM = 551;
const ROW_LINE = 11;

// Renderer owns layout only. Input has already been normalized by the same
// presentation model used on screen. All labels remain real PDF text.
export function renderDashboardPdf(doc, report) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const contentWidth = width - MARGIN * 2;
  const { draw, wrap, drawLines } = createPdfText(doc);

  function card(x, y, w, h) {
    doc.setFillColor(COLOR.panel);
    doc.setDrawColor(COLOR.border);
    doc.setLineWidth(0.65);
    doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  }

  function divider(x, y, w) {
    doc.setDrawColor(COLOR.border);
    doc.setLineWidth(0.6);
    doc.line(x, y, x + w, y);
  }

  function pageBackground(first = false) {
    doc.setFillColor(COLOR.background);
    doc.rect(0, 0, width, height, 'F');
    draw(report.heading.eyebrow.toUpperCase(), MARGIN, 30, 7.5, COLOR.blue, true);
    draw(first ? report.heading.title : 'Operations overview', MARGIN, first ? 52 : 48, first ? 20 : 15, COLOR.ink, true);
    if (first) draw(report.heading.subtitle, MARGIN, 69, 8.3, COLOR.muted);
    draw('TrueBites', width - MARGIN, 34, 13, COLOR.blue, true, { align: 'right' });
    draw(report.heading.updated, width - MARGIN, 51, 8, COLOR.muted, false, { align: 'right' });
  }

  function nextPage() {
    doc.addPage();
    pageBackground();
    return 68;
  }

  function panelHeader(x, y, w, info, continued = false) {
    draw(`${info.title}${continued ? ' (continued)' : ''}`, x + 14, y + 22, 10.5, COLOR.ink, true);
    const subtitle = wrap(info.subtitle, w - 28, 7.7);
    drawLines(subtitle, x + 14, y + 36, COLOR.muted, subtitle.lines.length, 10);
    const headerHeight = 44 + Math.max(0, subtitle.lines.length - 1) * 10;
    divider(x, y + headerHeight, w);
    return headerHeight;
  }

  // Small, printable vector icons instead of embedding React/DOM screenshots.
  function icon(key, x, y, tone) {
    const ink = { success: COLOR.teal, warning: COLOR.warning, accent: COLOR.accent }[tone] || COLOR.blue;
    const bg = { success: '#E6F4EF', warning: '#FFF4DD', accent: '#EEEAFE' }[tone] || '#EAF0FF';
    doc.setFillColor(bg);
    doc.roundedRect(x, y, 24, 24, 6, 6, 'F');
    doc.setDrawColor(ink);
    doc.setLineWidth(1.1);
    const line = (x1, y1, x2, y2) => doc.line(x + x1, y + y1, x + x2, y + y2);
    if (key === 'activeRate') {
      doc.circle(x + 12, y + 12, 6, 'S');
      line(9, 12, 11, 14); line(11, 14, 15, 10);
    } else if (key === 'totalVendors') {
      doc.rect(x + 6, y + 10, 12, 8, 'S');
      line(5, 10, 8, 6); line(8, 6, 16, 6); line(16, 6, 19, 10);
      doc.rect(x + 10, y + 13, 4, 5, 'S');
    } else if (key === 'pendingDrafts') {
      doc.roundedRect(x + 7, y + 6, 10, 13, 1, 1, 'S');
      doc.rect(x + 10, y + 4, 4, 3, 'S');
      line(9, 12, 11, 14); line(11, 14, 15, 10);
    } else if (key === 'aiImported') {
      doc.circle(x + 12, y + 12, 4, 'S');
      for (const shift of [8, 12, 16]) { line(shift, 4, shift, 7); line(shift, 17, shift, 20); line(4, shift, 7, shift); line(17, shift, 20, shift); }
    } else {
      doc.roundedRect(x + 6, y + 6, 12, 10, 1, 1, 'S');
      line(6, 16, 6, 19); line(6, 19, 10, 16); line(12, 8, 12, 11); line(12, 13, 12, 14);
    }
  }

  function kpis(y) {
    if (!report.kpis.length) return y;
    const w = (contentWidth - GAP * 4) / 5;
    for (let offset = 0; offset < report.kpis.length; offset += 5) {
      const items = report.kpis.slice(offset, offset + 5).map((item) => {
        const lineItems = (block, step, color, before = 0) => block.lines.map((text, index) => ({ text, size: block.size, bold: block.bold, step, color, before: index === 0 ? before : 0 }));
        return { item, lines: [
          ...lineItems(wrap(item.label, w - 26, 8.4, true), 11, COLOR.muted),
          ...lineItems(wrap(`${item.value}${item.suffix}`, w - 26, 23, true), 27, COLOR.ink, 16),
          ...lineItems(wrap(item.note, w - 26, 7.7), 10, COLOR.muted, -7),
        ] };
      });
      do {
        if (y + 114 > BODY_BOTTOM) y = nextPage();
        const desired = Math.max(114, ...items.map(({ lines }) => 57 + lines.reduce((sum, line) => sum + line.step + line.before, 0)));
        const h = Math.min(desired, BODY_BOTTOM - y);
        items.forEach(({ item, lines }, index) => {
          if (!lines.length) return;
          const x = MARGIN + index * (w + GAP);
          card(x, y, w, h); icon(item.key, x + 13, y + 13, item.tone);
          let cursor = 52;
          while (lines.length && cursor + lines[0].before <= h - 12) {
            const line = lines.shift();
            cursor += line.before;
            draw(line.text, x + 13, y + cursor, line.size, line.color, line.bold);
            cursor += line.step;
          }
        });
        y += h + GAP;
        if (!items.some(({ lines }) => lines.length)) break;
        y = nextPage();
      } while (true);
    }
    return y;
  }

  function growth(x, y, w, h) {
    card(x, y, w, h);
    const header = panelHeader(x, y, w, COPY.growth);
    draw(`${report.range}d`, x + w - 16, y + 22, 8.5, COLOR.blue, true, { align: 'right' });
    draw(report.rangeLabel, x + 14, y + header + 22, 8, COLOR.muted);
    let lx = x + w - 200;
    TREND_SERIES.forEach((series) => {
      doc.setFillColor(COLOR[series.tone]); doc.circle(lx, y + header + 19, 2.3, 'F');
      draw(series.label, lx + 6, y + header + 22, 7.4, COLOR.muted);
      lx += series.key === 'value' ? 87 : 58;
    });
    if (!report.trend.length) {
      draw(COPY.growth.empty, x + 14, y + header + 57, 9, COLOR.muted);
      return;
    }
    const plotX = x + 14, plotW = w - 28, top = y + header + 47, bottom = y + h - 45;
    for (let step = 0; step < 4; step++) divider(plotX, top + (bottom - top) * step / 3, plotW);
    const max = chartMaximum(report.trend, TREND_SERIES.map((series) => series.key));
    TREND_SERIES.forEach((series) => {
      doc.setDrawColor(COLOR[series.tone]); doc.setLineWidth(1.6);
      const points = chartPoints(report.trend, series.key, { width: plotW, top, bottom, max });
      points.slice(1).forEach((point, index) => doc.line(plotX + points[index][0], points[index][1], plotX + point[0], point[1]));
      if (points.length === 1) { doc.setFillColor(COLOR[series.tone]); doc.circle(plotX + points[0][0], points[0][1], 1.5, 'F'); }
    });
    const labels = [report.trend[0], report.trend[Math.floor(report.trend.length / 2)], report.trend.at(-1)];
    labels.forEach((item, index) => draw(item.label, plotX + index * plotW / 2, y + h - 17, 7.6, COLOR.muted, false, { align: ['left', 'center', 'right'][index] }));
  }

  // Consume as many wrapped rows as fit in one panel. Long individual rows are
  // split into continuation fragments, rather than clipped or scaled down.
  function listState(items, w, kind, tone = 'blue') {
    return items.map((item) => ({ item, block: wrap(item.label, w - (kind === 'attention' ? 76 : 70), 8.5), tone: kind === 'attention' ? ({ warning: 'warning', danger: 'danger', success: 'teal' }[item.tone] || 'blue') : barTone(item.tone, tone), first: true }));
  }

  function listPanel(x, y, w, available, info, queue, kind, max = 1, continued = false, minHeight = 0) {
    const subtitle = wrap(info.subtitle, w - 28, 7.7);
    const headerH = 44 + Math.max(0, subtitle.lines.length - 1) * 10;
    const rendered = [];
    let used = headerH + 12;
    if (!queue.length) used += 28;
    while (queue.length) {
      const row = queue[0];
      const padding = kind === 'attention' ? 18 : 17;
      const capacity = Math.floor((available - used - padding - 8) / ROW_LINE);
      if (capacity < 1) break;
      const count = Math.min(Math.max(1, row.block.lines.length), capacity);
      const all = count >= row.block.lines.length;
      rendered.push({ ...row, block: { ...row.block, lines: row.block.lines.slice(0, count) }, y: used, all });
      used += count * ROW_LINE + padding;
      if (all) queue.shift();
      else { row.block = { ...row.block, lines: row.block.lines.slice(count) }; row.first = false; break; }
    }
    const h = Math.min(available, Math.max(minHeight, used + 6));
    card(x, y, w, h); panelHeader(x, y, w, info, continued);
    if (!rendered.length && !queue.length) drawLines(wrap(info.empty, w - 28, 8.2), x + 14, y + headerH + 25, COLOR.muted);
    rendered.forEach((row) => {
      const rowY = y + row.y + 8;
      const labelX = x + (kind === 'attention' ? 26 : 14);
      if (kind === 'attention') { doc.setFillColor(COLOR[row.tone]); doc.circle(x + 16, rowY - 3, 2.6, 'F'); }
      drawLines(row.block, labelX, rowY, kind === 'attention' ? COLOR.ink : COLOR.muted);
      if (row.first) draw(row.item.value, x + w - 14, rowY, 9.5, COLOR.ink, true, { align: 'right' });
      const bottom = rowY + (row.block.lines.length - 1) * ROW_LINE;
      if (kind === 'bar' && row.all) {
        doc.setFillColor(COLOR.track); doc.roundedRect(x + 14, bottom + 7, w - 28, 4.5, 2, 2, 'F');
        doc.setFillColor(COLOR[row.tone]);
        const fill = Math.max(1.5, Math.max(0, row.item.value) / max * (w - 28));
        doc.roundedRect(x + 14, bottom + 7, fill, 4.5, Math.min(2, fill / 2), 2, 'F');
      } else if (kind === 'attention') divider(x + 14, bottom + 13, w - 28);
    });
    return h;
  }

  function attention(y, growthW, h) {
    const w = contentWidth - growthW - GAP;
    const queue = listState(report.attentionItems, w, 'attention');
    listPanel(MARGIN + growthW + GAP, y, w, h, COPY.attention, queue, 'attention', 1, false, h);
    while (queue.length) {
      y = nextPage();
      listPanel(MARGIN + growthW + GAP, y, w, BODY_BOTTOM - y, COPY.attention, queue, 'attention', 1, true);
    }
  }

  function breakdowns(y) {
    const widths = [5, 4, 3].map((span) => (contentWidth - 2 * GAP) * span / 12);
    const groups = [
      { info: COPY.pipeline, data: report.aiPipeline, tone: 'blue' },
      { info: COPY.categories, data: report.categoryBreakdown, tone: 'blue' },
      { info: COPY.sources, data: report.sourceBreakdown, tone: 'teal' },
    ].map((group, index) => ({ ...group, queue: listState(group.data, widths[index], 'bar', group.tone), max: chartMaximum(group.data) }));
    let continued = false;
    do {
      let x = MARGIN, maxHeight = 0;
      const desired = Math.max(130, ...groups.map((group) => 62 + group.queue.reduce((sum, row) => sum + Math.max(1, row.block.lines.length) * ROW_LINE + 17, 0)));
      groups.forEach((group, index) => {
        if (!continued || group.queue.length) {
          maxHeight = Math.max(maxHeight, listPanel(x, y, widths[index], BODY_BOTTOM - y, group.info, group.queue, 'bar', group.max, continued, Math.min(desired, BODY_BOTTOM - y)));
        }
        x += widths[index] + GAP;
      });
      if (!groups.some((group) => group.queue.length)) return y + maxHeight + GAP;
      y = nextPage(); continued = true;
    } while (true);
  }

  function activity(y) {
    const typeW = 84, statusW = 93, itemW = contentWidth - typeW - statusW - 56;
    let rows = report.activityRows.map((row) => ({
      type: wrap(row.type, typeW - 12, 8), title: wrap(row.title, itemW, 8.8, true),
      meta: wrap(row.meta, itemW, 7.6), status: wrap(row.status, statusW - 12, 7.7, true),
      tone: statusToneFor(row.status),
    }));
    let continued = false;
    do {
      if (y + 90 > BODY_BOTTOM) y = nextPage();
      const rendered = [];
      let used = 63;
      while (rows.length) {
        const row = rows[0];
        const availableLines = Math.floor((BODY_BOTTOM - y - used - 12) / 10);
        if (availableLines < 2) break;
        const itemLines = row.title.lines.length + row.meta.lines.length;
        const needed = Math.max(1, itemLines, row.type.lines.length, row.status.lines.length);
        // Move whole rows to a fresh page when they can fit there intact.
        if (needed > availableLines && needed * 10 + 75 < BODY_BOTTOM - 68) break;
        const count = Math.min(needed, availableLines);
        const titleCount = Math.min(row.title.lines.length, count);
        const metaCount = Math.min(row.meta.lines.length, count - titleCount);
        rendered.push({ row, used, count, titleCount, metaCount });
        used += count * 10 + 8;
        if (count === needed) rows.shift();
        else {
          rows[0] = { ...row,
            type: { ...row.type, lines: row.type.lines.slice(count) }, status: { ...row.status, lines: row.status.lines.slice(count) },
            title: { ...row.title, lines: row.title.lines.slice(titleCount) }, meta: { ...row.meta, lines: row.meta.lines.slice(metaCount) },
          };
          break;
        }
      }
      if (!rendered.length && rows.length) { y = nextPage(); continued = true; continue; }
      card(MARGIN, y, contentWidth, used + (rendered.length ? 5 : 28));
      draw(`${COPY.activity.title}${continued ? ' (continued)' : ''}`, MARGIN + 14, y + 20, 10.5, COLOR.ink, true);
      draw(COPY.activity.subtitle, MARGIN + 14, y + 33, 7.7, COLOR.muted);
      divider(MARGIN, y + 42, contentWidth);
      const typeX = MARGIN + 14, itemX = typeX + typeW, statusX = width - MARGIN - statusW;
      draw('Type', typeX, y + 55, 7.5, COLOR.muted, true);
      draw('Item', itemX, y + 55, 7.5, COLOR.muted, true);
      draw('Status', statusX, y + 55, 7.5, COLOR.muted, true);
      if (!rendered.length) draw(COPY.activity.empty, typeX, y + 79, 8.5, COLOR.muted);
      rendered.forEach(({ row, used: rowY, count, titleCount, metaCount }) => {
        drawLines(row.type, typeX, y + rowY + 9, COLOR.muted, count, 10);
        drawLines(row.title, itemX, y + rowY + 9, COLOR.ink, titleCount, 10);
        drawLines(row.meta, itemX, y + rowY + 9 + titleCount * 10, COLOR.muted, metaCount, 10);
        drawLines(row.status, statusX, y + rowY + 9, ({ draft: COLOR.warning, suspended: COLOR.danger, active: COLOR.teal })[row.tone], count, 10);
        divider(MARGIN + 14, y + rowY + count * 10 + 5, contentWidth - 28);
      });
      if (!rows.length) break;
      y = nextPage(); continued = true;
    } while (true);
  }

  pageBackground(true);
  let y = kpis(86);
  if (y + 220 > BODY_BOTTOM) y = nextPage();
  const growthW = (contentWidth - GAP) * 2 / 3;
  const growthH = BODY_BOTTOM - y;
  growth(MARGIN, y, growthW, growthH);
  attention(y, growthW, growthH);
  y = nextPage();
  activity(breakdowns(y));

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    divider(MARGIN, height - 30, contentWidth);
    draw('TrueBites · Dashboard snapshot', MARGIN, height - 17, 7.4, COLOR.muted);
    draw(`${page} / ${total}`, width - MARGIN, height - 17, 7.4, COLOR.muted, false, { align: 'right' });
  }
  doc.setProperties({ title: 'TrueBites - Operations overview', subject: report.rangeLabel, author: 'TrueBites' });
  return doc;
}

export async function createDashboardPdf(report) {
  const [{ jsPDF }, { installDashboardFonts }] = await Promise.all([import('jspdf'), import('./dashboardPdfFonts.js')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true, putOnlyUsedFonts: true });
  await installDashboardFonts(doc, report);
  return renderDashboardPdf(doc, report);
}
