// Shared operating-hours parsing and Malaysia-time evaluation for both the
// discovery filters and the status shown on vendor cards/details.
const TWELVE_HOUR_RANGE_RE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i;
const TWENTY_FOUR_HOUR_RANGE_RE = /(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)(?:[^\d]|$)/;

function twelveHourMinutes(hour, minute = "00", period) {
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  if (numericHour < 1 || numericHour > 12 || numericMinute < 0 || numericMinute > 59) return null;
  return (numericHour % 12 + (/pm/i.test(period) ? 12 : 0)) * 60 + numericMinute;
}

export function parseOperatingWindow(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/\b24\s*hours?\b/i.test(text)) return { open: 0, close: 1440 };

  const twelveHour = TWELVE_HOUR_RANGE_RE.exec(text);
  if (twelveHour) {
    const open = twelveHourMinutes(twelveHour[1], twelveHour[2], twelveHour[3]);
    const close = twelveHourMinutes(twelveHour[4], twelveHour[5], twelveHour[6]);
    return open == null || close == null ? null : { open, close };
  }

  const twentyFourHour = TWENTY_FOUR_HOUR_RANGE_RE.exec(text);
  if (!twentyFourHour) return null;
  return {
    open: Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]),
    close: Number(twentyFourHour[3]) * 60 + Number(twentyFourHour[4]),
  };
}

export function operatingWindowForVendor(vendor) {
  return parseOperatingWindow(vendor?.operating_hours_raw)
    || parseOperatingWindow(vendor?.operating_hours);
}

export function rangeSegments(range) {
  if (range.open === 0 && range.close === 1440) return [[0, 1440]];
  return range.close > range.open
    ? [[range.open, range.close]]
    : [[range.open, 1440], [0, range.close]];
}

export function operatingWindowsOverlap(left, right) {
  return rangeSegments(left).some(([leftStart, leftEnd]) =>
    rangeSegments(right).some(([rightStart, rightEnd]) => leftStart < rightEnd && rightStart < leftEnd));
}

export function malaysiaMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export function isOperatingNow(window, now = new Date()) {
  if (!window) return false;
  const minute = malaysiaMinutes(now);
  return rangeSegments(window).some(([start, end]) => minute >= start && minute < end);
}

export function formatOperatingClock(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatMalaysiaTime(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now).replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
}

export function operatingStatusAt(vendor, now = new Date(), closingSoonMinutes = 60) {
  const window = operatingWindowForVendor(vendor);
  if (!window || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return { kind: "unavailable" };
  }
  if (window.open === 0 && window.close === 1440) return { kind: "open-24" };
  if (window.open === window.close) return { kind: "unavailable" };

  const minute = malaysiaMinutes(now);
  const overnight = window.close < window.open;
  const open = overnight
    ? minute >= window.open || minute < window.close
    : minute >= window.open && minute < window.close;
  if (!open) return { kind: "closed" };

  const minutesToClose = overnight && minute >= window.open
    ? 1440 - minute + window.close
    : window.close - minute;
  return {
    kind: minutesToClose <= closingSoonMinutes ? "closing-soon" : "open",
    closeText: formatOperatingClock(window.close),
  };
}

export function operatingStatus(vendor, now = new Date()) {
  const window = operatingWindowForVendor(vendor);
  if (!window) return null;
  return {
    isOpen: isOperatingNow(window, now),
    label: window.open === 0 && window.close === 1440
      ? "24 hours"
      : `${formatOperatingClock(window.open)} – ${formatOperatingClock(window.close)}`,
  };
}
