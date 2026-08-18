import os
import json
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL_NAME = "openai/gpt-oss-20b"


def extract_info(transcript: str, summary: str = "", video_title: str = "") -> dict:
    """
    Use Groq (llama-3.1-8b-instant) to extract structured eatery information
    from a food influencer transcript (+ optional AI summary for context).
    Returns a dict with eatery details — ALL values in English.
    """
    summary_section = ""
    if summary and summary.strip():
        summary_section = f"""
AI Summary (English — use this to fill vendor_name and address if the transcript is unclear):
\"\"\"
{summary.strip()}
\"\"\"
"""

    title_section = f"Video Title: {video_title}\n" if video_title else ""

    prompt = f"""You are an AI that extracts structured information from Malaysian food influencer video transcripts.

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
- operating_hours_raw: Opening hours if mentioned (in English)
- sentiment_score: Numeric score from 1.0 to 5.0 based on the reviewer's enthusiasm (e.g., 4.5)
- special_notes: Any special tips, warnings, or highlights in English (short string)
{title_section}{summary_section}
Transcript:
\"\"\"
{transcript}
\"\"\"

Return ONLY the JSON object, no explanation, no markdown:"""

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        top_p=0.9,
        max_tokens=500,
    )

    raw_text = response.choices[0].message.content.strip()

    # Extract JSON from response
    try:
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if json_match:
            extracted = json.loads(json_match.group())
        else:
            extracted = json.loads(raw_text)
    except (json.JSONDecodeError, Exception):
        extracted = {
            "vendor_name": None,
            "address": None,
            "city": None,
            "state": None,
            "country": "Malaysia",
            "is_in_malacca": False,
            "cuisine_types": [],
            "signature_dishes": [],
            "price_range": None,
            "operating_hours_raw": None,
            "sentiment_score": None,
            "special_notes": "Could not parse structured data from transcript.",
            "raw_response": raw_text,
        }

    return extracted
