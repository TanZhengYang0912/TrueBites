// Single-row CSV export of a completed job's extracted vendor info — port
// of the /export-csv/{job_id} handler in backend/routes/process.py.
const HEADERS = [
  "vendor_name", "address", "city", "state", "country",
  "latitude", "longitude", "cuisine_types", "signature_dishes",
  "price_range", "sentiment_score", "average_rating", "review_count",
  "ai_review_summary", "operating_hours_raw", "source_video_url",
  "source_platform", "last_updated",
];

function esc(value) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

// Returns { filename, buffer } — buffer already has the UTF-8 BOM Excel
// needs to open the file without mangling non-ASCII characters.
export function buildJobCsv(job) {
  const extracted = job.extracted || {};
  const dishes = (extracted.signature_dishes || []).join(", ");
  const cuisines = (extracted.cuisine_types || []).join(", ");
  const platform = /tiktok/i.test(job.url || "") ? "TikTok" : "YouTube";

  const row = [
    esc(extracted.vendor_name || ""),
    esc(extracted.address || ""),
    esc(extracted.city || ""),
    esc(extracted.state || ""),
    esc(extracted.country || "Malaysia"),
    esc(""), // latitude — filled in only once the vendor is actually saved/geocoded
    esc(""), // longitude
    esc(cuisines),
    esc(dishes),
    esc(extracted.price_range || ""),
    esc(extracted.sentiment_score ?? ""),
    esc(""), // average_rating
    esc(""), // review_count
    esc(job.summary || ""),
    esc(extracted.operating_hours_raw || ""),
    esc(job.url || ""),
    esc(platform),
    esc(new Date().toISOString()),
  ];

  const csv = `${HEADERS.join(",")}\n${row.join(",")}\n`;
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const buffer = Buffer.concat([bom, Buffer.from(csv, "utf8")]);

  const vendorSafe = (extracted.vendor_name || "vendor").replace(/[^a-zA-Z0-9]/g, "_");
  return { filename: `${vendorSafe}.csv`, buffer };
}
