export const SUGGESTION_STATUSES = [
  "submitted",
  "under_review",
  "needs_info",
  "accepted_for_processing",
  "processing",
  "admin_review",
  "draft_created",
  "published",
  "duplicate",
  "rejected",
  "failed",
];

const TRANSITIONS = {
  submitted: ["under_review", "needs_info", "duplicate", "rejected"],
  under_review: ["needs_info", "accepted_for_processing", "duplicate", "rejected"],
  needs_info: ["under_review", "rejected"],
  accepted_for_processing: ["processing", "rejected", "needs_info", "duplicate", "under_review"],
  processing: ["admin_review", "failed"],
  admin_review: ["draft_created", "duplicate", "rejected", "processing"],
  draft_created: ["published", "rejected"],
  failed: ["processing", "rejected"],
  published: [],
  duplicate: [],
  rejected: [],
};

const ALLOWED_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "youtube.com", "www.youtube.com", "youtu.be"]);

const text = (value) => String(value ?? "").trim();

export function platformForUrl(rawUrl) {
  const url = text(rawUrl);
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;
  if (host.includes("youtube") && (parsed.pathname === "/" || parsed.pathname === "")) return null;
  if (host === "youtu.be" && parsed.pathname.length <= 1) return null;
  if ((host.includes("tiktok") || host.includes("youtube")) && /\/@[^/]+(?:\/)?$/.test(parsed.pathname)) return null;

  return host.includes("tiktok") ? "TikTok" : "YouTube";
}

export function isMalaccaLocation(value) {
  const location = text(value).toLowerCase();
  return /\b(?:malacca|melaka)\b/.test(location);
}

export function validateSuggestionInput(input = {}) {
  const errors = {};
  const vendorName = text(input.vendor_name);
  const sourceUrl = text(input.source_url);
  const location = text(input.location_text);
  const reason = text(input.reason);

  if (vendorName.length < 2 || vendorName.length > 120) errors.vendor_name = "Vendor name must be 2–120 characters.";
  const platform = platformForUrl(sourceUrl);
  if (!platform) errors.source_url = "Use a TikTok or YouTube video URL, not a profile URL.";
  if (location.length < 2 || location.length > 180) errors.location_text = "Add a Malacca area or address.";
  else if (!isMalaccaLocation(location)) errors.location_text = "Only Malacca/Melaka vendors can be submitted.";
  if (reason.length < 10 || reason.length > 1000) errors.reason = "Tell us why this hidden gem is worth trying (10–1,000 characters).";

  for (const [key, max] of [["category", 80], ["signature_dish", 160], ["price_range", 80], ["additional_note", 1000]]) {
    if (text(input[key]).length > max) errors[key] = `${key.replaceAll("_", " ")} is too long.`;
  }

  return {
    errors,
    clean: {
      vendor_name: vendorName,
      source_url: sourceUrl,
      source_platform: platform,
      location_text: location,
      reason,
      category: text(input.category) || null,
      signature_dish: text(input.signature_dish) || null,
      price_range: text(input.price_range) || null,
      additional_note: text(input.additional_note) || null,
    },
  };
}

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`Cannot change suggestion from ${from} to ${to}.`);
    error.code = "INVALID_SUGGESTION_TRANSITION";
    throw error;
  }
}

export function isCustomerVisibleStatus(status) {
  return SUGGESTION_STATUSES.includes(status);
}
