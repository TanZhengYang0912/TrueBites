import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL_NAME = "openai/gpt-oss-20b"


def summarize_transcript(transcript: str, language: str = "en", video_title: str = "") -> str:
    """
    Use Groq (llama-3.1-8b-instant) to summarize a food influencer transcript.
    Returns a concise summary of food recommendations.
    """
    lang_instruction = "Respond in English only. If the transcript is in Malay or Chinese, translate the key information to English."

    title_section = f"Video Title: {video_title}\n" if video_title else ""

    prompt = f"""You are analyzing a transcript from a Malaysian food influencer video.

{lang_instruction}

Your task is to produce a CONCISE SUMMARY (3-5 sentences) of the video content focusing on:
- Start the summary by explicitly stating the city or state where the eatery is located (e.g., 'This video features a food spot in Malacca' or 'This is a recommendation for a cafe in Kuala Lumpur').
- What food or eatery is being reviewed/recommended
- Key highlights mentioned (taste, price, ambience, must-try dishes)
- Overall recommendation or sentiment

{title_section}
Transcript:
\"\"\"
{transcript}
\"\"\"

Write a clear, engaging summary:"""

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        top_p=0.9,
        max_tokens=400,
    )

    return response.choices[0].message.content.strip()
