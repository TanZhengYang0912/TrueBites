// Speech-to-text via Groq's hosted Whisper API — replaces the Python
// original's LOCAL openai-whisper model (small, CPU inference). Groq
// removes the need for a multi-hundred-MB local model file and native
// build tooling entirely; the domain prompt and language hint carry over
// unchanged so transcription quality for Malay/English Melaka food content
// stays comparable.
import fs from "node:fs";
import { groqClient, WHISPER_MODEL } from "./groqClient.js";

const DOMAIN_PROMPT = "Malay and English food recommendation from Melaka, Malaysia. Keep vendor names, dish names, locations, and Malaysian place names.";
const DEFAULT_LANGUAGE = (process.env.WHISPER_LANGUAGE || "ms").toLowerCase().trim();

// Whitespace-normalise each segment's text; empty overall -> unreliable.
function normalizedSegmentTexts(segments) {
  return (segments || [])
    .map((s) => String(s.text || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Catches two of Whisper's classic failure modes: (1) an infinite decode
// loop repeating the same phrase over and over, (2) decoding into entirely
// the wrong script (noise/silence occasionally comes out as e.g. Thai/
// Chinese/Arabic glyphs). Heuristic, not exact parity with the Python
// original's unicodedata.name()-based check — that's fine, it's a safety
// net, not the transcription itself.
export function isUnreliableTranscript(segments) {
  const texts = normalizedSegmentTexts(segments);
  if (!texts.length) return true;

  if (texts.length >= 4) {
    const counts = new Map();
    for (const t of texts) counts.set(t, (counts.get(t) || 0) + 1);
    const [topText, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount / texts.length >= 0.6 && topText.split(" ").filter(Boolean).length >= 3) return true;
  }

  const allText = texts.join(" ");
  const alphabetic = allText.match(/\p{L}/gu) || [];
  if (alphabetic.length >= 8) {
    const nonLatin = alphabetic.filter((ch) => !/\p{Script=Latin}/u.test(ch)).length;
    if (nonLatin / alphabetic.length > 0.25) return true;
  }

  return false;
}

// Groq's free tier caps uploads at 25MB — downloader.js already re-encodes
// audio to mono/16kHz/64kbps specifically to stay well under that.
export async function transcribeAudio(audioPath, { language = DEFAULT_LANGUAGE } = {}) {
  let response;
  try {
    response = await groqClient().audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: WHISPER_MODEL,
      language,
      prompt: DOMAIN_PROMPT,
      temperature: 0,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });
  } catch (err) {
    console.error("transcription request failed:", err.message);
    return { text: "", language: "unknown", segments: [] };
  }

  const segments = (response.segments || []).map((s) => ({
    start: s.start,
    end: s.end,
    text: String(s.text || "").trim(),
  }));

  if (isUnreliableTranscript(segments) || !String(response.text || "").trim()) {
    return { text: "", language: "unknown", segments: [] };
  }

  return {
    text: String(response.text).trim(),
    language: response.language || language || "unknown",
    segments,
  };
}
