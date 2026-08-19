// Renders simple bar/pie charts to PNG data URLs via the Canvas 2D API, for
// embedding in the admin overview PDF export (jsPDF has no native charting —
// this avoids pulling in a charting library for two chart types).
//
// Colors follow the dataviz skill's validated default palette (light mode):
// fixed categorical hue order for identity series, the reserved status
// palette for genuine status values (active/draft/suspended), never a
// cycled/rainbow assignment. See frontend/src/lib/chartColors.js.

const CHROME = {
  surface: "#fcfcfb",
  primaryInk: "#0b0b0b",
  mutedInk: "#898781",
  baseline: "#c3c2b7",
};

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const DPR = 2; // render at 2x so the embedded PNG stays crisp in the PDF

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width * DPR;
  canvas.height = height * DPR;
  const ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);
  return { canvas, ctx };
}

function truncate(label, max = 12) {
  const text = String(label || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Vertical bar chart — one categorical series, thin bars with rounded tops
// anchored to a baseline, direct value labels (few enough bars per chart
// here that labeling all of them is the "selective" case, not the dense-
// line case the skill warns against).
export function renderBarChartPng({ data, colors, width = 500, height = 280 }) {
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = CHROME.surface;
  ctx.fillRect(0, 0, width, height);

  const padding = { top: 26, right: 16, bottom: 40, left: 16 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const slotW = chartW / n;
  const barWidth = Math.min(52, slotW - 14);

  ctx.strokeStyle = CHROME.baseline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartH + 0.5);
  ctx.lineTo(padding.left + chartW, padding.top + chartH + 0.5);
  ctx.stroke();

  data.forEach((d, i) => {
    const barH = maxVal ? (d.value / maxVal) * (chartH - 22) : 0;
    const slotX = padding.left + i * slotW;
    const x = slotX + (slotW - barWidth) / 2;
    const y = padding.top + chartH - barH;
    const r = Math.min(4, barWidth / 2, Math.max(barH, 1));

    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(x, y + barH);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + barWidth - r, y);
    ctx.arcTo(x + barWidth, y, x + barWidth, y + r, r);
    ctx.lineTo(x + barWidth, y + barH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = CHROME.primaryInk;
    ctx.font = `600 12px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(String(d.value), slotX + slotW / 2, y - 7);

    ctx.fillStyle = CHROME.mutedInk;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(truncate(d.label), slotX + slotW / 2, padding.top + chartH + 18);
  });

  return canvas.toDataURL("image/png");
}

// Pie chart — parts of a whole. Legend is drawn separately by the caller
// (as jsPDF text/swatches) so it can sit in the PDF's own type system —
// a legend is required whenever there are 2+ series, per the skill.
export function renderPieChartPng({ data, colors, size = 240 }) {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = CHROME.surface;
  ctx.fillRect(0, 0, size, size);

  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  let angle = -Math.PI / 2;

  data.forEach((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    // 2px surface-color ring between adjacent slices (spacer rule).
    ctx.strokeStyle = CHROME.surface;
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += slice;
  });

  return canvas.toDataURL("image/png");
}
