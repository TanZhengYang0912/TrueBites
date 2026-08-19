// Chart color slots for the admin overview PDF export — the dataviz skill's
// validated default palette (light mode), used exactly as documented rather
// than re-derived: fixed categorical hue order for identity series (never
// cycled), the reserved status palette for genuine status values. Both are
// pre-validated for CVD-safe adjacent contrast; do not reorder.

// Fixed order — adjacent-pair CVD-safe for bar/line charts with up to 8
// series. Slicing to the first N slots (in order) keeps that guarantee.
export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

// Reserved — never reused for a generic series. Vendor status values map
// directly onto these roles.
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

const STATUS_LABEL_MAP = {
  active: STATUS.good,
  approved: STATUS.good,
  success: STATUS.good,
  draft: STATUS.warning,
  pending: STATUS.warning,
  warning: STATUS.warning,
  needs_review: STATUS.warning,
  "needs review": STATUS.warning,
  suspended: STATUS.critical,
  rejected: STATUS.critical,
  danger: STATUS.critical,
  hidden: STATUS.critical,
  accent: CATEGORICAL[0],
  neutral: CATEGORICAL[0],
};

// Maps a breakdown item's label/tone (whichever is more specific) to a
// status color when it genuinely represents state ("Active", "Suspended",
// tone: "danger", …), falling back to the fixed categorical order for
// plain identity breakdowns (vendor categories, source platforms).
export function colorsForBreakdown(items = []) {
  return items.map((item, i) => {
    const key = String(item.tone || item.label || "").toLowerCase().replace(/\s+/g, "_");
    return STATUS_LABEL_MAP[key] || STATUS_LABEL_MAP[String(item.label || "").toLowerCase()] || CATEGORICAL[i % CATEGORICAL.length];
  });
}
