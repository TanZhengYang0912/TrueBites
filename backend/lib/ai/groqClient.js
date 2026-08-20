// Single shared Groq client — lazily constructed so importing this module
// never fails just because GROQ_API_KEY isn't set yet (matters for tests).
import Groq from "groq-sdk";

let client = null;

export function groqClient() {
  if (!client) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

// openai/gpt-oss-20b is Groq's hosted open-weight model used for both
// summarization and extraction — same model id the Python service used
// (its own in-file comments calling it "llama-3.1-8b-instant" were stale;
// this MODEL_NAME constant is what actually ran).
export const CHAT_MODEL = "openai/gpt-oss-20b";
export const WHISPER_MODEL = "whisper-large-v3";
