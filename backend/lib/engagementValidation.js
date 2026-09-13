// Pure validation helpers for routes/engagement.js (bookmarks/folders/reviews).
// Extracted so they're unit-testable without mocking Supabase — kept
// dependency-free of the database, same convention as vendorValidation.js.
import { Filter } from "bad-words";

export const MAX_REVIEW_BODY_LENGTH = 999;

// Same rules as frontend/src/lib/folderName.js — kept in sync manually since
// the two apps don't share a module.
export const FOLDER_NAME_MAX_LENGTH = 45;
const ILLEGAL_FOLDER_NAME_CHARS = /[\\/:*?"<>|]/;

export function validateFolderName(raw) {
  const name = String(raw || "").trim();
  if (!name) return { error: "Folder name is required." };
  if (name.length > FOLDER_NAME_MAX_LENGTH) {
    return { error: `Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer.` };
  }
  if (ILLEGAL_FOLDER_NAME_CHARS.test(name)) {
    return { error: 'Folder name cannot contain \\ / : * ? " < > |' };
  }
  return { name };
}

// Rejects non-integer input (e.g. "4.9") instead of silently truncating it —
// Number.parseInt("4.9", 10) would otherwise pass as a valid rating of 4.
export function parseRating(raw) {
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : null;
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) return Number.parseInt(raw, 10);
  return null;
}

export function validateReviewBody(raw) {
  const body = String(raw || "").trim() || null;
  if (body && body.length > MAX_REVIEW_BODY_LENGTH) {
    return { error: `Review must be ${MAX_REVIEW_BODY_LENGTH} characters or fewer.` };
  }
  return { body };
}

const filter = new Filter();
filter.removeWords("god", "hell", "bloody", "sex");

const MALAYSIAN_BADWORDS = [
  "babi", "sial", "bodoh", "bangang", "bengap", "celaka", "sohai", "bangsat",
  "tolol", "bongok", "jahanam", "bedebah", "haramjadah", "keparat",
  "asu", "jalang", "sundal", "gatal", "gian", "gatai", "pundek",
  "puki", "pukimak", "kimak", "konek", "kote", "pantat", "punai", "bontot",
  "jubur", "burit", "fuck","cibai", "chibai", "cheebye", "cb", "ccb", "lancau", "lanjiao",
  "lancaubabi", "diu", "diulei", "diulehlohmo", "knn", "kns", "kanina",
  "kanasai", "kolomoye", "kaniaseh", "hampalang", "siao", "gau", "lampa", "yier", "laosai",
  "thevidiya", "otha", "punda", "koothi", "pundachi",
  "wtf", "stfu", "ffs", "omfg", "af", "asf", "bullshit", "douchebag",
  "douche", "scumbag", "jackass", "fucktard", "shitface", "fuckface",
  "dipshit", "cockhead", "cumdumpster", "thot", "simp", "hoe", "coon",
  "spic", "chink", "gook", "tranny", "dyke",
];
filter.addWords(...MALAYSIAN_BADWORDS);

// Multi-word vulgar phrases — checked separately below, since these can't
// be matched by the single-word list above.
const MALAYSIAN_BADWORD_PHRASES = [
  "gila babi", "kepala hotak", "anak haram", "puki mak", "itik puki",
  "lubang pantat", "chao chee bye", "diu lei lo mo", "kanina lang",
  "chao chibai", "thevidiya paiya", "otha mavane", "son of a bitch",
  "motherfucking", "kepala baba kau",
];

const LEET_MAP = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s" };
function normalizeForDetection(word) {
  return word
    .toLowerCase()
    .split("")
    .map((ch) => LEET_MAP[ch] || ch)
    .join("")
    .replace(/(.)\1+/g, "$1");
}

// Checked against the base list, MALAYSIAN_BADWORDS (word by word), evasive
// spellings (via normalizeForDetection), and MALAYSIAN_BADWORD_PHRASES
// (against the full string, since those are multi-word).
export function isProfaneLoose(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (MALAYSIAN_BADWORD_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  return text.split(/[^\p{L}\p{N}]+/u).some((word) => {
    if (!word) return false;
    return filter.isProfane(word) || filter.isProfane(normalizeForDetection(word));
  });
}
