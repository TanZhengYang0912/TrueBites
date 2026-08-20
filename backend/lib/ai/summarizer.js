// AI summary of a food-influencer video transcript — port of
// backend/services/summarizer.py. Prompt copied verbatim; it's tuned, don't
// paraphrase it.
import { groqClient, CHAT_MODEL } from "./groqClient.js";

export async function summarizeTranscript(transcript, { language = "en", videoTitle = "" } = {}) {
  const langInstruction = "Respond in English only. If the transcript is in Malay or Chinese, translate the key information to English.";
  const titleSection = videoTitle ? `Video Title: ${videoTitle}\n` : "";

  const prompt = `You are analyzing a transcript from a Malaysian food influencer video.

${langInstruction}

Your task is to produce a CONCISE SUMMARY (3-5 sentences) of the video content focusing on:
- Start the summary by explicitly stating the city or state where the eatery is located (e.g., 'This video features a food spot in Malacca' or 'This is a recommendation for a cafe in Kuala Lumpur').
- What food or eatery is being reviewed/recommended
- Key highlights mentioned (taste, price, ambience, must-try dishes)
- Overall recommendation or sentiment

${titleSection}
Transcript:
"""
${transcript}
"""

Write a clear, engaging summary:`;

  const response = await groqClient().chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    top_p: 0.9,
    // See extractor.js for why: this reasoning model's hidden reasoning
    // still spends max_tokens budget even when reasoning_format hides it
    // from the output, so give it enough room and cap reasoning verbosity.
    max_tokens: 800,
    reasoning_format: "hidden",
    reasoning_effort: "low",
  });

  return response.choices[0].message.content.trim();
}
