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

const SUGGESTION_STATUS_FILTER_GROUPS = {
  needs_review: ["submitted", "under_review", "needs_info", "admin_review", "failed"],
  in_progress: ["accepted_for_processing", "processing", "draft_created"],
  published: ["published"],
  closed: ["rejected", "duplicate"],
};

export function statusesForSuggestionFilter(filter) {
  if (filter === "all") return null;
  if (SUGGESTION_STATUS_FILTER_GROUPS[filter]) return SUGGESTION_STATUS_FILTER_GROUPS[filter];
  if (SUGGESTION_STATUSES.includes(filter)) return [filter];
  return null;
}

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
const CREATOR_PROFILE_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "youtube.com", "www.youtube.com"]);

const text = (value) => String(value ?? "").trim();

function isHttpUrl(rawUrl) {
  try {
    const url = new URL(text(rawUrl));
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

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

export function platformForProfileUrl(rawUrl) {
  const url = text(rawUrl);
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!CREATOR_PROFILE_HOSTS.has(host)) return null;
  if (host.includes("tiktok")) return /^\/@[^/]+$/.test(pathname) ? "TikTok" : null;
  if (/^\/@[^/]+$/.test(pathname) || /^\/(?:channel|c|user)\/[^/]+$/.test(pathname)) return "YouTube";
  return null;
}

export function isMalaccaLocation(value) {
  const location = text(value).toLowerCase();
  return /\b(?:malacca|melaka)\b/.test(location);
}

export function validateSuggestionInput(input = {}) {
  const errors = {};
  const suggestionType = text(input.suggestion_type) || "vendor";
  const vendorName = text(input.vendor_name);
  const influencerName = text(input.influencer_name);
  const sourceUrl = text(input.source_url);
  const location = text(input.location_text);
  const reason = text(input.reason);
  const creatorName = text(input.creator_name);
  const creatorProfileUrl = text(input.creator_profile_url);
  const creatorSampleVideoUrl = text(input.creator_sample_video_url);
  const creatorFocus = text(input.creator_focus);
  const creatorAudience = text(input.creator_audience);
  const creatorSocialUrl = text(input.creator_social_url);

  if (!["vendor", "creator"].includes(suggestionType)) errors.suggestion_type = "Choose a valid suggestion type.";

  if (reason.length < 10 || reason.length > 1000) errors.reason = "Tell us why this hidden gem is worth trying (10–1,000 characters).";

  for (const [key, max] of [["influencer_name", 120], ["category", 80], ["signature_dish", 160], ["price_range", 80], ["additional_note", 1000], ["creator_name", 120], ["creator_profile_url", 1000], ["creator_sample_video_url", 1000], ["creator_focus", 160], ["creator_audience", 180], ["creator_social_url", 1000]]) {
    if (text(input[key]).length > max) errors[key] = `${key.replaceAll("_", " ")} is too long.`;
  }

  if (suggestionType === "creator") {
    const profilePlatform = platformForProfileUrl(creatorProfileUrl);
    if (creatorName.length < 2 || creatorName.length > 120) errors.creator_name = "Creator name must be 2–120 characters.";
    if (!profilePlatform) errors.creator_profile_url = "Use a TikTok or YouTube profile URL.";
    if (creatorFocus.length < 2 || creatorFocus.length > 160) errors.creator_focus = "Tell us what this creator usually shares.";
    if (creatorSampleVideoUrl && !platformForUrl(creatorSampleVideoUrl)) errors.creator_sample_video_url = "Use a TikTok or YouTube video URL.";
    if (creatorSocialUrl && !isHttpUrl(creatorSocialUrl)) errors.creator_social_url = "Use an http or https social link.";
    return {
      errors,
      clean: {
        suggestion_type: "creator",
        source_kind: "profile",
        vendor_name: null,
        influencer_name: null,
        source_url: creatorProfileUrl,
        source_platform: profilePlatform,
        location_text: null,
        category: null,
        reason,
        signature_dish: null,
        price_range: null,
        additional_note: text(input.additional_note) || null,
        creator_name: creatorName,
        creator_profile_url: creatorProfileUrl || null,
        creator_sample_video_url: creatorSampleVideoUrl || null,
        creator_focus: creatorFocus,
        creator_audience: creatorAudience || null,
        creator_social_url: creatorSocialUrl || null,
      },
    };
  }

  if (vendorName.length < 2 || vendorName.length > 120) errors.vendor_name = "Vendor name must be 2–120 characters.";
  const platform = platformForUrl(sourceUrl);
  if (!platform) errors.source_url = "Use a TikTok or YouTube video URL, not a profile URL.";
  if (location.length < 2 || location.length > 180) errors.location_text = "Add a Malacca area or address.";
  else if (!isMalaccaLocation(location)) errors.location_text = "Only Malacca/Melaka vendors can be submitted.";

  return {
    errors,
    clean: {
      suggestion_type: "vendor",
      source_kind: "video",
      vendor_name: vendorName,
      influencer_name: influencerName || null,
      source_url: sourceUrl,
      source_platform: platform,
      location_text: location,
      reason,
      category: text(input.category) || null,
      signature_dish: text(input.signature_dish) || null,
      price_range: text(input.price_range) || null,
      additional_note: text(input.additional_note) || null,
      creator_name: null,
      creator_profile_url: null,
      creator_sample_video_url: null,
      creator_focus: null,
      creator_audience: null,
      creator_social_url: null,
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
