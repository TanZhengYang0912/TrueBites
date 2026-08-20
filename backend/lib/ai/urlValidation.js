// Pure regex URL classification — no network call. Port of
// backend/services/downloader.py's validate_url.
const PATTERNS = [
  { platform: "youtube", url_type: "video", re: /youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\// },
  { platform: "youtube", url_type: "profile", re: /youtube\.com\/@[\w.]+\/?$|youtube\.com\/channel\/[\w-]+\/?$|youtube\.com\/c\/[\w-]+\/?$|youtube\.com\/user\/[\w-]+\/?$/ },
  { platform: "tiktok", url_type: "video", re: /tiktok\.com\/@.+\/video\/|vm\.tiktok\.com\/|vt\.tiktok\.com\// },
  { platform: "tiktok", url_type: "profile", re: /tiktok\.com\/@[\w.]+\/?$/ },
];

export function validateUrl(url) {
  const value = String(url || "").trim();
  if (!value) return { valid: false, platform: null, url_type: null, error: "URL is required" };

  for (const { platform, url_type, re } of PATTERNS) {
    if (re.test(value)) return { valid: true, platform, url_type, error: null };
  }
  return { valid: false, platform: null, url_type: null, error: "Must be a TikTok or YouTube video/profile URL" };
}
