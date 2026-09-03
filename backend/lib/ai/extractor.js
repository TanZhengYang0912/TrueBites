// Structured vendor-info extraction from a transcript (+ optional AI
// summary) — port of backend/services/extractor.py. Prompt copied verbatim.
import { groqClient, CHAT_MODEL } from "./groqClient.js";

const FALLBACK_EXTRACTION = () => ({
  vendor_name: null,
  address: null,
  city: null,
  state: null,
  country: "Malaysia",
  is_in_malacca: false,
  cuisine_types: [],
  signature_dishes: [],
  price_range: null,
  operating_hours_raw: null,
  sentiment_score: null,
  special_notes: "Could not parse structured data from transcript.",
});

export async function extractInfo(transcript, { summary = "", videoTitle = "" } = {}) {
  const summarySection = summary && summary.trim()
    ? `\nAI Summary (English — use this to fill vendor_name and address if the transcript is unclear):\n"""\n${summary.trim()}\n"""\n`
    : "";
  const titleSection = videoTitle ? `Video Title: ${videoTitle}\n` : "";

  const prompt = `You are an AI that extracts structured information from Malaysian food influencer video transcripts.

CRITICAL: All extracted text values MUST be in English only. Translate any Malay or Chinese words to English.

Extract the following information and return ONLY a valid JSON object.
If a field is not mentioned in either source, use null for its value, EXCEPT for vendor_name, location/city/state, and price_range.

IMPORTANT: You MUST deduce or make an educated guess for vendor_name, city/state, and price_range using the Video Title and AI Summary if they are not explicitly in the transcript. DO NOT leave them empty if there is any clue in the title or summary.
Default country to "Malaysia".

Fields to extract:
- vendor_name: Name of the restaurant, stall, or food establishment (in English)
- address: Full address or area mentioned (in English)
- city: City mentioned (e.g., "Melaka", "Kuala Lumpur", "Johor Bahru")
- state: State mentioned (e.g., "Melaka", "Selangor")
- country: Always "Malaysia" unless explicitly stated otherwise
- is_in_malacca: Boolean (true/false). If the eatery is in Malacca (Melaka) or mentions Jonker Street, set true.
- cuisine_types: List of cuisine types or categories (e.g., ["Nyonya", "Dessert", "Cafe"]) (array of strings)
- signature_dishes: List of specific dishes or foods mentioned in English (array of strings)
- price_range: Approximate cost or price range in English (e.g. "RM10-20 per person"). Guess based on food type if needed.
- operating_hours_raw: Opening hours only when an explicit opening and closing time (or "24 hours") is mentioned. Do not treat promotion dates or date ranges as opening hours; use null instead.
- sentiment_score: Numeric score from 1.0 to 5.0 based on the reviewer's enthusiasm (e.g., 4.5)
- special_notes: Any special tips, warnings, or highlights in English (short string)
${titleSection}${summarySection}
Transcript:
"""
${transcript}
"""

Return ONLY the JSON object, no explanation, no markdown:`;

  const response = await groqClient().chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    top_p: 0.9,
    // openai/gpt-oss-20b is a reasoning model — its hidden reasoning tokens
    // still count against max_tokens even with reasoning_format:"hidden"
    // (that flag only hides reasoning from the OUTPUT, not from token
    // spend). Confirmed live: at the Python original's max_tokens:500, a
    // real transcript hit finish_reason:"length" with EMPTY content —
    // reasoning alone consumed the whole budget. reasoning_effort:"low"
    // plus a higher budget fixed it (tested: real extraction succeeded at
    // ~230 completion tokens once effort was capped).
    max_tokens: 1000,
    reasoning_format: "hidden",
    reasoning_effort: "low",
  });

  const rawText = response.choices[0].message.content.trim();
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    return { ...FALLBACK_EXTRACTION(), raw_response: rawText };
  }
}

// Regex fallback for when the LLM extraction left vendor_name/city null —
// the AI summary's opening sentence is written to a predictable shape
// ("This video features a food spot in Malacca."), so a couple of patterns
// can usually recover both. Port of the fallback block in
// backend/routes/process.py's run_pipeline — kept as a separate pure
// function here so it's unit-testable without a live Groq call.
const NAME_PATTERNS = [
  /(?:eatery|restaurant|cafe|stall|spot|place)\s+(?:is\s+|called\s+|named\s+)?['"]?([A-Z][^.,\n'"]{2,40})['"]?/i,
  /(?:features?|reviewing|visited?|at)\s+([A-Z][A-Za-z0-9\s'&-]{2,35})(?:\s+in\s+|\s+at\s+|\s*[,.])/i,
];

const KNOWN_CITIES = "Malacca|Melaka|Kuala Lumpur|KL|Penang|Johor Bahru|JB|Selangor|Putrajaya|Cyberjaya|Subang|Shah Alam|Petaling Jaya|PJ|Klang|Ipoh|Kota Kinabalu|Kuching|Alor Setar|Kota Bharu|Kuala Terengganu|Miri|Sibu";
const LOCATION_PATTERNS = [
  new RegExp(`\\bin\\s+(${KNOWN_CITIES})\\b`, "i"),
  /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
];

export function backfillFromSummary(extracted, summary) {
  const result = { ...extracted };
  if (!summary) return result;

  if (!result.vendor_name) {
    for (const pattern of NAME_PATTERNS) {
      const match = summary.match(pattern);
      if (match) { result.vendor_name = match[1].trim(); break; }
    }
  }

  if (!result.city) {
    const firstSentences = summary.split(".").slice(0, 2).join(". ");
    for (const pattern of LOCATION_PATTERNS) {
      const match = firstSentences.match(pattern);
      if (match) {
        result.city = match[1].trim();
        const lower = result.city.toLowerCase();
        if (lower.includes("malacca") || lower.includes("melaka")) result.is_in_malacca = true;
        break;
      }
    }
  }

  return result;
}
