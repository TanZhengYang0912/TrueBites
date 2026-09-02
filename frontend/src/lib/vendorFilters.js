// One vendor-matching rule, shared by the discovery list and the map's vendor
// panel. MapPage derives one result collection from this module so cards, pins,
// and sidebar rows cannot disagree about an active filter.
import { categoryMatches, creatorHandle } from "./vendorDisplay.js";

export const DEFAULT_VENDOR_FILTERS = Object.freeze({
  search: "",
  category: "all",
  creator: "all",
  price: "all",
  hours: "any",
  rating: "any",
  distance: "any",
  openNow: false,
});

export const DEFAULT_VENDOR_SORT = "relevant";

const PRICE_BUCKETS = Object.freeze({
  "under-10": { min: 0, max: 9.999 },
  "10-20": { min: 10, max: 20 },
  "20-40": { min: 20, max: 40 },
  "40-plus": { min: 40, max: Infinity },
});

const OPERATING_PERIODS = Object.freeze({
  breakfast: { open: 6 * 60, close: 11 * 60 },
  lunch: { open: 11 * 60, close: 15 * 60 },
  dinner: { open: 17 * 60, close: 22 * 60 },
  "late-night": { open: 22 * 60, close: 2 * 60 },
});

const PRICE_RE = /^\s*RM\s*(\d+(?:\.\d+)?)\s*(?:[-–—]\s*(?:RM\s*)?(\d+(?:\.\d+)?))?(?:\s+per person)?\s*$/i;
const HOURS_RE = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i;

function finiteNumber(value) {
  if (value == null || value === "") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export function parsePriceRange(value) {
  const match = PRICE_RE.exec(String(value || ""));
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2] || match[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

function toMinutes(hour, minute, period) {
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  if (numericHour < 1 || numericHour > 12 || numericMinute < 0 || numericMinute > 59) return null;
  return (numericHour % 12 + (/pm/i.test(period) ? 12 : 0)) * 60 + numericMinute;
}

export function parseOperatingWindow(value) {
  const match = HOURS_RE.exec(String(value || ""));
  if (!match) return null;
  const open = toMinutes(match[1], match[2], match[3]);
  const close = toMinutes(match[4], match[5], match[6]);
  return open == null || close == null ? null : { open, close };
}

function rangeSegments(range) {
  return range.close > range.open
    ? [[range.open, range.close]]
    : [[range.open, 1440], [0, range.close]];
}

function operatingWindowsOverlap(left, right) {
  return rangeSegments(left).some(([leftStart, leftEnd]) =>
    rangeSegments(right).some(([rightStart, rightEnd]) => leftStart < rightEnd && rightStart < leftEnd));
}

function containsMinute(range, minute) {
  return range.close > range.open
    ? minute >= range.open && minute < range.close
    : minute >= range.open || minute < range.close;
}

function malaysiaMinutes(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export function matchesFilters(vendor, filters = {}, { now = new Date() } = {}) {
  const active = { ...DEFAULT_VENDOR_FILTERS, ...filters };

  const query = active.search.trim().toLowerCase();
  if (query) {
    const haystack = [vendor.name, vendor.cuisine_types, vendor.signature_dishes]
      .map((field) => String(field || "").toLowerCase());
    if (!haystack.some((field) => field.includes(query))) return false;
  }

  if (!categoryMatches(vendor, active.category)) return false;
  if (active.creator !== "all" && creatorHandle(vendor) !== active.creator) return false;

  if (active.price !== "all") {
    const storedPrice = parsePriceRange(vendor.price_range);
    const bucket = PRICE_BUCKETS[active.price];
    if (!storedPrice || !bucket || storedPrice.max < bucket.min || storedPrice.min > bucket.max) return false;
  }

  const operatingWindow = parseOperatingWindow(vendor.operating_hours_raw || vendor.operating_hours);
  if (active.hours !== "any") {
    const period = OPERATING_PERIODS[active.hours];
    if (!operatingWindow || !period || !operatingWindowsOverlap(operatingWindow, period)) return false;
  }
  if (active.openNow && (!operatingWindow || !containsMinute(operatingWindow, malaysiaMinutes(now)))) return false;

  if (active.rating !== "any") {
    const rating = finiteNumber(vendor.average_rating);
    const minimumRating = finiteNumber(active.rating);
    if (!Number.isFinite(rating) || !Number.isFinite(minimumRating) || rating < minimumRating) return false;
  }

  if (active.distance !== "any") {
    const distance = finiteNumber(vendor.distKm);
    const maximumDistance = finiteNumber(active.distance);
    if (!Number.isFinite(distance) || !Number.isFinite(maximumDistance) || distance > maximumDistance) return false;
  }

  return true;
}

// Drives the Clear all affordance. A non-default sort also counts because the
// same action restores both narrowing and ordering controls.
export function filtersActive(filters = {}, sort = DEFAULT_VENDOR_SORT) {
  const active = { ...DEFAULT_VENDOR_FILTERS, ...filters };
  return Object.keys(DEFAULT_VENDOR_FILTERS)
    .some((key) => key === "search"
      ? String(active.search || "").trim() !== ""
      : active[key] !== DEFAULT_VENDOR_FILTERS[key])
    || sort !== DEFAULT_VENDOR_SORT;
}

export function sortVendors(vendors, sort = DEFAULT_VENDOR_SORT) {
  const rows = vendors.map((vendor, index) => ({ vendor, index }));

  const compareKnown = (left, right, read, { descending = false, stable = true } = {}) => {
    const leftValue = finiteNumber(read(left.vendor));
    const rightValue = finiteNumber(read(right.vendor));
    const leftKnown = Number.isFinite(leftValue);
    const rightKnown = Number.isFinite(rightValue);
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    if (!leftKnown) return left.index - right.index;
    const comparison = descending ? rightValue - leftValue : leftValue - rightValue;
    return comparison || (stable ? left.index - right.index : 0);
  };

  if (sort === "rating") {
    rows.sort((left, right) =>
      compareKnown(left, right, (vendor) => vendor.average_rating, { descending: true, stable: false })
      || compareKnown(left, right, (vendor) => vendor.review_count, { descending: true }));
  } else if (sort === "nearest") {
    rows.sort((left, right) => compareKnown(left, right, (vendor) => vendor.distKm));
  } else if (sort === "price-low") {
    rows.sort((left, right) => compareKnown(left, right, (vendor) => parsePriceRange(vendor.price_range)?.min));
  }

  return rows.map(({ vendor }) => vendor);
}
