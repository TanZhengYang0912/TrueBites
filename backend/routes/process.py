import uuid
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
import io
from pydantic import BaseModel, Field
from typing import Optional

import os
from services.downloader import download_audio, validate_url, scrape_profile
from services.transcriber import transcribe_audio
from services.summarizer import summarize_transcript
from services.extractor import extract_info
from services.frameExtractor import extract_frames
from services.supabase_client import (
    geocode_address, upsert_vendor, find_duplicate_vendors,
    upload_vendor_image_from_url, set_vendor_storefront_image,
)

router = APIRouter()

# This service's own externally-reachable base URL — used to hand the Node
# backend absolute links to extracted frame files (served statically, see
# main.py's StaticFiles mount) so it can download+re-host whichever one an
# admin picks, the same way it already does for Mapillary/Flickr/TikTok
# candidate URLs.
SELF_BASE_URL = os.getenv("AI_SERVICE_SELF_URL", "http://localhost:8000")

# Dedicated thread pool for profile scraping — isolated from batch pipeline threads
# so "Fetch Videos" is always fast even when a large batch is running.
_scrape_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="scrape")
# Frame extraction downloads a full video + runs several ffmpeg calls — kept
# separate so a slow extraction never queues up behind (or blocks) scraping.
_frame_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="frames")

OUTPUTS_DIR = Path(__file__).parent.parent / "outputs"
OUTPUTS_DIR.mkdir(exist_ok=True)

# In-memory job store
jobs: dict = {}

# In-memory batch store  { batch_id: { batch_id, job_ids, created_at, profile_url } }
batches: dict = {}

# In-memory scrape job store  { scrape_id: { status, videos, error, created_at } }
scrape_jobs: dict = {}


class URLRequest(BaseModel):
    url: str


class ValidateRequest(BaseModel):
    url: str


class ScrapeProfileRequest(BaseModel):
    url: str
    start: int = 1
    end: int = 10


class BatchProcessRequest(BaseModel):
    urls: list
    profile_url: str = ""


class VendorSaveEntry(BaseModel):
    job_id: str
    # Admin-editable overrides from the results table; falls back to the
    # AI-extracted value when not provided.
    vendor_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    price_range: Optional[str] = None
    operating_hours_raw: Optional[str] = None
    # Mirrors DraftRequest.duplicate_acknowledged below — /save-to-database is a
    # batch of several vendors, so each needs its own ack rather than one
    # request-wide flag.
    duplicate_acknowledged: bool = False


class SaveToDatabaseRequest(BaseModel):
    vendors: list[VendorSaveEntry]


class ExtractFramesRequest(BaseModel):
    video_url: str


class ReviewRequest(BaseModel):
    summary: Optional[str] = ""
    extracted: dict = Field(default_factory=dict)


class DraftRequest(ReviewRequest):
    duplicate_acknowledged: bool = False


def _load_job(job_id: str):
    if job_id in jobs:
        return jobs[job_id]

    job_file = OUTPUTS_DIR / job_id / "status.json"
    if not job_file.exists():
        return None

    with open(job_file, "r", encoding="utf-8") as f:
        jobs[job_id] = json.load(f)
    return jobs[job_id]


def _review_extracted(job: dict, extracted: dict):
    allowed_fields = {
        "vendor_name", "address", "city", "state", "country", "price_range",
        "operating_hours_raw", "cuisine_types", "signature_dishes", "special_notes",
        "sentiment_score", "is_in_malacca",
    }
    current = dict(job.get("extracted") or {})
    for key, value in (extracted or {}).items():
        if key in allowed_fields and value is not None:
            current[key] = value
    return current


def _is_malacca_location(extracted: dict):
    location = " ".join(str(extracted.get(key) or "") for key in ("address", "city", "state")).lower()
    if "malacca" in location or "melaka" in location:
        return True
    return bool(extracted.get("is_in_malacca"))


def _persist_review(job_id: str, summary: str, extracted: dict):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Job is not ready for review")

    reviewed_summary = str(summary or "").strip()
    reviewed_extracted = _review_extracted(job, extracted)
    reviewed_extracted["is_in_malacca"] = _is_malacca_location(reviewed_extracted)
    job_dir = OUTPUTS_DIR / job_id
    job_dir.mkdir(exist_ok=True)
    with open(job_dir / "summary.txt", "w", encoding="utf-8") as f:
        f.write(reviewed_summary)
    with open(job_dir / "extraction.json", "w", encoding="utf-8") as f:
        json.dump(reviewed_extracted, f, ensure_ascii=False, indent=2)

    update_job(
        job_id,
        summary=reviewed_summary,
        extracted=reviewed_extracted,
        review_status="reviewed",
        reviewed_at=datetime.now().isoformat(),
    )
    return jobs[job_id]


def _draft_vendor_row(job: dict, extracted: dict, summary: str):
    vendor_name = extracted.get("vendor_name")
    if not vendor_name:
        raise HTTPException(status_code=400, detail="Vendor name is required before creating a draft")

    address = extracted.get("address") or ""
    city = extracted.get("city") or ""
    state = extracted.get("state") or ""
    geo = geocode_address(vendor_name, address, city, state)
    platform = "TikTok" if "tiktok" in (job.get("url") or "").lower() else "YouTube"

    return {
        "vendor_name": vendor_name,
        "address": geo["formatted_address"] if geo else address,
        "city": city,
        "state": state,
        "latitude": geo["latitude"] if geo else None,
        "longitude": geo["longitude"] if geo else None,
        "location_precision": geo["precision"] if geo else "unknown",
        "cuisine_types": ", ".join(extracted.get("cuisine_types") or []),
        "signature_dishes": ", ".join(extracted.get("signature_dishes") or []),
        "price_range": extracted.get("price_range"),
        "sentiment_score": extracted.get("sentiment_score"),
        "ai_review_summary": summary,
        "operating_hours_raw": extracted.get("operating_hours_raw"),
        "source_video_url": job.get("url"),
        "source_platform": platform,
        "status": "draft",
        "last_updated": datetime.now().isoformat(),
    }


def _attach_ai_thumbnail(vendor_row: dict, thumbnail_url: str):
    """
    Best-effort: re-hosts the video thumbnail yt-dlp already fetched and attaches
    it as the vendor's storefront_image_url, so admin-created-from-AI vendors
    show a real photo on the public site instead of a placeholder.

    Never overwrites an existing storefront_image_url — a manual admin upload
    always takes precedence over an AI-derived thumbnail. Any failure here
    (missing bucket, network error, etc.) is logged and swallowed: a broken
    thumbnail must never fail vendor creation/save.
    """
    if not vendor_row or not thumbnail_url:
        return
    if vendor_row.get("storefront_image_url"):
        return
    vendor_id = vendor_row.get("id")
    if not vendor_id:
        return
    try:
        hosted_url = upload_vendor_image_from_url(vendor_id, thumbnail_url)
        if hosted_url:
            set_vendor_storefront_image(vendor_id, hosted_url)
    except Exception as e:
        print(f"[vendor-image] failed to attach AI thumbnail for vendor {vendor_id}: {e}")


def update_job(job_id: str, **kwargs):
    if job_id in jobs:
        jobs[job_id].update(kwargs)
    # Persist to disk
    job_dir = OUTPUTS_DIR / job_id
    job_dir.mkdir(exist_ok=True)
    with open(job_dir / "status.json", "w", encoding="utf-8") as f:
        json.dump(jobs[job_id], f, ensure_ascii=False, indent=2)


def run_pipeline(job_id: str, url: str):
    """Full processing pipeline: download → transcribe → summarize → extract."""
    try:
        # ── Step 1: Download ──────────────────────────────────────────────────
        update_job(job_id,
                   status="downloading",
                   step=1,
                   step_label="Downloading video audio...",
                   progress=10)

        download_result = download_audio(url, job_id)

        update_job(job_id,
                   step=1,
                   step_label="Download complete",
                   progress=25,
                   title=download_result["title"],
                   thumbnail=download_result["thumbnail"])

        # ── Step 2: Transcribe ────────────────────────────────────────────────
        update_job(job_id,
                   status="transcribing",
                   step=2,
                   step_label="Transcribing audio with Whisper...",
                   progress=30)

        transcription = transcribe_audio(download_result["audio_path"])

        # Save transcript
        job_dir = OUTPUTS_DIR / job_id
        with open(job_dir / "transcript.txt", "w", encoding="utf-8") as f:
            f.write(transcription["text"])

        update_job(job_id,
                   step=2,
                   step_label="Transcription complete",
                   progress=55,
                   transcript=transcription["text"],
                   detected_language=transcription["language"],
                   segments=transcription["segments"])

        # ── Step 3: Summarize ─────────────────────────────────────────────────
        update_job(job_id,
                   status="summarizing",
                   step=3,
                   step_label="Generating AI summary with Ollama...",
                   progress=60)

        summary = summarize_transcript(
            transcription["text"],
            language=transcription["language"],
            video_title=download_result.get("title", "")
        )

        # Save summary
        with open(job_dir / "summary.txt", "w", encoding="utf-8") as f:
            f.write(summary)

        update_job(job_id,
                   step=3,
                   step_label="Summary complete",
                   progress=80,
                   summary=summary)

        # ── Step 4: Extract ───────────────────────────────────────────────────
        update_job(job_id,
                   status="extracting",
                   step=4,
                   step_label="Extracting structured information...",
                   progress=85)

        # Pass the summary alongside the transcript so the LLM has clear
        # English context to identify eatery name and location even when
        # the raw transcript is in Malay or mixed language.
        extracted = extract_info(
            transcription["text"], 
            summary=summary,
            video_title=download_result.get("title", "")
        )

        # ── Fallback: parse eatery/location from summary if still null ────────
        # The summary starts with a sentence like:
        #   "This video features a food spot in Malacca."
        #   "This is a recommendation for Mr. Moyo in Kuala Lumpur."
        # We use simple regex to extract the eatery name and city when the
        # LLM extraction left them as null.
        # NOTE: extract_info() returns "vendor_name"/"city" (not "eatery_name"/
        # "location") — this fallback must key off the same names or it never fires.
        import re as _re

        if not extracted.get("vendor_name") and summary:
            # Look for eatery name patterns in the summary
            name_patterns = [
                r"(?:eatery|restaurant|cafe|stall|spot|place)\s+(?:is\s+|called\s+|named\s+)?['\"]?([A-Z][^.,\n'\"]{2,40})['\"]?",
                r"(?:features?|reviewing|visited?|at)\s+([A-Z][A-Za-z0-9\s'&\-]{2,35})(?:\s+in\s+|\s+at\s+|\s*[,.])",
            ]
            for pat in name_patterns:
                m = _re.search(pat, summary, _re.IGNORECASE)
                if m:
                    extracted["vendor_name"] = m.group(1).strip()
                    break

        if not extracted.get("city") and summary:
            # Look for city/location in the first two sentences of the summary
            first_sentences = ". ".join(summary.split(".")[:2])
            loc_patterns = [
                r"\bin\s+(Malacca|Melaka|Kuala Lumpur|KL|Penang|Johor Bahru|JB|Selangor|Putrajaya|Cyberjaya|Subang|Shah Alam|Petaling Jaya|PJ|Klang|Ipoh|Kota Kinabalu|Kuching|Alor Setar|Kota Bharu|Kuala Terengganu|Miri|Sibu)\b",
                r"\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
            ]
            for pat in loc_patterns:
                m = _re.search(pat, first_sentences, _re.IGNORECASE)
                if m:
                    extracted["city"] = m.group(1).strip()
                    # Update is_in_malacca if we found a location
                    loc_lower = extracted["city"].lower()
                    if "malacca" in loc_lower or "melaka" in loc_lower:
                        extracted["is_in_malacca"] = True
                    break

        # Save extraction
        with open(job_dir / "extraction.json", "w", encoding="utf-8") as f:
            json.dump(extracted, f, ensure_ascii=False, indent=2)

        update_job(job_id,
                   step=4,
                   step_label="Extraction complete",
                   status="completed",
                   progress=100,
                   extracted=extracted,
                   completed_at=datetime.now().isoformat())


    except Exception as e:
        update_job(job_id,
                   status="error",
                   error=str(e),
                   progress=0)


@router.post("/validate-url")
async def api_validate_url(req: ValidateRequest):
    result = validate_url(req.url)
    return result


# Vendor Photos feature — on-demand frame extraction from a vendor's own
# source_video_url, called by the Node backend's videoFrameProvider.js as one
# of several automatic photo-discovery sources. Synchronous request/response
# (no job/polling, unlike scrape-profile above) since this is a single
# bounded operation an admin explicitly triggers and waits for; the blocking
# download+ffmpeg work runs in _frame_executor so it doesn't stall the event
# loop for any other in-flight request.
@router.post("/extract-frames")
async def api_extract_frames(req: ExtractFramesRequest):
    validation = validate_url(req.video_url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["error"])
    if validation["url_type"] != "video":
        raise HTTPException(status_code=400, detail="video_url must be a single video link, not a profile/channel link.")

    job_id = f"frames-{uuid.uuid4()}"
    loop = asyncio.get_event_loop()
    try:
        frames = await loop.run_in_executor(_frame_executor, extract_frames, req.video_url, job_id)
    except RuntimeError as e:
        # Download failure (deleted video, network issue, etc) — no candidates,
        # not a server error; the caller treats this like "provider found nothing".
        return {"frames": [], "error": str(e)}

    return {
        "frames": [
            {
                "url": f"{SELF_BASE_URL}/outputs/{job_id}/frames/{f['path'].name}",
                "sharpness": round(f["sharpness"], 1),
                "brightness": round(f["brightness"], 1),
            }
            for f in frames
        ]
    }


def _run_scrape_job(scrape_id: str, url: str, start: int, end: int, platform: str):
    """Background worker: run yt-dlp scrape and store results in scrape_jobs."""
    try:
        videos = scrape_profile(url, start=start, end=end)
        scrape_jobs[scrape_id].update({
            "status": "done",
            "videos": videos,
            "count": len(videos),
            "platform": platform,
        })
    except Exception as e:
        scrape_jobs[scrape_id].update({"status": "error", "error": str(e)})


@router.post("/scrape-profile")
async def api_scrape_profile(req: ScrapeProfileRequest, background_tasks: BackgroundTasks):
    """Start a profile scrape in the background. Returns scrape_id immediately."""
    validation = validate_url(req.url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["error"])
    if validation["url_type"] != "profile":
        raise HTTPException(status_code=400, detail="URL is a single video, not a profile. Use /api/process instead.")

    scrape_id = str(uuid.uuid4())
    scrape_jobs[scrape_id] = {
        "scrape_id": scrape_id,
        "status": "scraping",   # scraping | done | error
        "url": req.url,
        "platform": validation["platform"],
        "videos": [],
        "count": 0,
        "error": None,
        "created_at": datetime.now().isoformat(),
    }

    # Fire-and-forget in the dedicated scrape thread pool
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _scrape_executor,
        lambda: _run_scrape_job(scrape_id, req.url, req.start, req.end, validation["platform"])
    )

    return {"scrape_id": scrape_id, "status": "scraping"}


@router.get("/scrape-status/{scrape_id}")
async def api_scrape_status(scrape_id: str):
    """Poll for scrape job results."""
    if scrape_id not in scrape_jobs:
        raise HTTPException(status_code=404, detail="Scrape job not found")
    return scrape_jobs[scrape_id]


def run_batch_pipeline(batch_id: str, urls: list):
    """Run the full pipeline for each URL sequentially, updating batch state."""
    for job_id in batches[batch_id]["job_ids"]:
        job = jobs.get(job_id)
        if not job:
            continue
        run_pipeline(job_id, job["url"])


@router.post("/batch-process")
async def api_batch_process(req: BatchProcessRequest, background_tasks: BackgroundTasks):
    """Start a batch job for multiple video URLs."""
    if not req.urls:
        raise HTTPException(status_code=400, detail="No URLs provided")
    if len(req.urls) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 videos per batch")

    batch_id = str(uuid.uuid4())
    job_ids = []

    for url in req.urls:
        validation = validate_url(url)
        if not validation["valid"]:
            continue  # skip invalid URLs
        job_id = str(uuid.uuid4())
        jobs[job_id] = {
            "job_id": job_id,
            "batch_id": batch_id,
            "url": url,
            "platform": validation["platform"],
            "status": "queued",
            "step": 0,
            "step_label": "Queued for processing",
            "progress": 0,
            "title": None,
            "thumbnail": None,
            "transcript": None,
            "detected_language": None,
            "segments": [],
            "summary": None,
            "extracted": None,
            "error": None,
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
        }
        job_ids.append(job_id)

    batches[batch_id] = {
        "batch_id": batch_id,
        "profile_url": req.profile_url,
        "job_ids": job_ids,
        "total": len(job_ids),
        "created_at": datetime.now().isoformat(),
    }

    background_tasks.add_task(run_batch_pipeline, batch_id, req.urls)

    return {"batch_id": batch_id, "job_ids": job_ids, "total": len(job_ids)}


@router.get("/batch-status/{batch_id}")
async def api_batch_status(batch_id: str):
    """Return current status of all jobs in a batch."""
    if batch_id not in batches:
        raise HTTPException(status_code=404, detail="Batch not found")
    batch = batches[batch_id]
    job_statuses = []
    for job_id in batch["job_ids"]:
        if job_id in jobs:
            job_statuses.append(jobs[job_id])
    completed = sum(1 for j in job_statuses if j["status"] == "completed")
    failed    = sum(1 for j in job_statuses if j["status"] == "error")
    return {
        "batch_id": batch_id,
        "profile_url": batch["profile_url"],
        "total": batch["total"],
        "completed": completed,
        "failed": failed,
        "in_progress": batch["total"] - completed - failed,
        "jobs": job_statuses,
    }


@router.post("/process")
async def api_process(req: URLRequest, background_tasks: BackgroundTasks):
    # Validate URL first
    validation = validate_url(req.url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["error"])

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "url": req.url,
        "platform": validation["platform"],
        "status": "queued",
        "step": 0,
        "step_label": "Queued for processing",
        "progress": 0,
        "title": None,
        "thumbnail": None,
        "transcript": None,
        "detected_language": None,
        "segments": [],
        "summary": None,
        "extracted": None,
        "error": None,
        "review_status": "pending",
        "retry_count": 0,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
    }

    background_tasks.add_task(run_pipeline, job_id, req.url)

    return {"job_id": job_id, "status": "queued"}


@router.get("/status/{job_id}")
async def api_status(job_id: str):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/retry/{job_id}")
async def api_retry(job_id: str, background_tasks: BackgroundTasks):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "error":
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")

    retry_count = int(job.get("retry_count") or 0) + 1
    update_job(
        job_id,
        status="queued",
        step=0,
        step_label="Queued for retry",
        progress=0,
        transcript=None,
        detected_language=None,
        segments=[],
        summary=None,
        extracted=None,
        error=None,
        completed_at=None,
        review_status="pending",
        retry_count=retry_count,
    )
    background_tasks.add_task(run_pipeline, job_id, job["url"])
    return {"job_id": job_id, "status": "queued", "retry_count": retry_count}


@router.post("/review/{job_id}")
async def api_review_job(job_id: str, req: ReviewRequest):
    return _persist_review(job_id, req.summary or "", req.extracted or {})


@router.post("/duplicate-check/{job_id}")
async def api_duplicate_check(job_id: str, req: ReviewRequest):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Job is not ready for duplicate checking")

    extracted = _review_extracted(job, req.extracted or {})
    vendor_name = extracted.get("vendor_name") or ""
    try:
        candidates = find_duplicate_vendors(
            vendor_name,
            extracted.get("address") or "",
            extracted.get("city") or "",
            extracted.get("state") or "",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Duplicate check failed: {e}")
    return {"job_id": job_id, "candidates": candidates, "has_duplicates": bool(candidates)}


@router.post("/create-draft/{job_id}")
async def api_create_draft(job_id: str, req: DraftRequest):
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    reviewed = _persist_review(job_id, req.summary or "", req.extracted or {})
    extracted = reviewed.get("extracted") or {}
    if not _is_malacca_location(extracted):
        raise HTTPException(status_code=400, detail="Only Malacca locations can be created as vendor drafts")

    try:
        candidates = find_duplicate_vendors(
            extracted.get("vendor_name") or "",
            extracted.get("address") or "",
            extracted.get("city") or "",
            extracted.get("state") or "",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Duplicate check failed: {e}")

    if candidates and not req.duplicate_acknowledged:
        return {
            "job_id": job_id,
            "status": "duplicate_review_required",
            "candidates": candidates,
        }

    try:
        saved = upsert_vendor(_draft_vendor_row(reviewed, extracted, reviewed.get("summary") or ""))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Draft vendor save failed: {e}")

    vendor_row = (saved or [None])[0]
    _attach_ai_thumbnail(vendor_row, reviewed.get("thumbnail"))

    vendor_id = vendor_row.get("id") if vendor_row else None
    update_job(job_id, review_status="draft_created", draft_created_at=datetime.now().isoformat(), vendor_id=vendor_id)
    return {
        "job_id": job_id,
        "status": "draft_created",
        "vendor_id": vendor_id,
        "candidates": candidates,
    }


@router.get("/results/{job_id}")
async def api_results(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=202, detail="Job not yet completed")
    return job


@router.get("/export-csv/{job_id}")
async def api_export_csv(job_id: str):
    """Export extracted eatery data as a UTF-8 CSV file (server-side, bypasses browser blob restrictions)."""
    if job_id not in jobs:
        job_file = OUTPUTS_DIR / job_id / "status.json"
        if job_file.exists():
            with open(job_file, "r", encoding="utf-8") as f:
                job = json.load(f)
        else:
            raise HTTPException(status_code=404, detail="Job not found")
    else:
        job = jobs[job_id]

    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Job not yet completed")

    extracted = job.get("extracted") or {}

    headers = [
        "vendor_name", "address", "city", "state", "country",
        "latitude", "longitude", "cuisine_types", "signature_dishes",
        "price_range", "sentiment_score", "average_rating", "review_count",
        "ai_review_summary", "operating_hours_raw", "source_video_url",
        "source_platform", "last_updated",
    ]

    dishes   = ", ".join(extracted.get("signature_dishes", []) or [])
    cuisines = ", ".join(extracted.get("cuisine_types", []) or [])
    platform = "TikTok" if "tiktok" in (job.get("url") or "").lower() else "YouTube"

    def _esc(v):
        if v is None:
            return '""'
        return '"' + str(v).replace('"', '""') + '"'

    row = [
        _esc(extracted.get("vendor_name", "")),
        _esc(extracted.get("address", "")),
        _esc(extracted.get("city", "")),
        _esc(extracted.get("state", "")),
        _esc(extracted.get("country", "Malaysia")),
        _esc(""),  # latitude
        _esc(""),  # longitude
        _esc(cuisines),
        _esc(dishes),
        _esc(extracted.get("price_range", "")),
        _esc(extracted.get("sentiment_score", "")),
        _esc(""),  # average_rating
        _esc(""),  # review_count
        _esc(job.get("summary", "")),
        _esc(extracted.get("operating_hours_raw", "")),
        _esc(job.get("url", "")),
        _esc(platform),
        _esc(datetime.now().isoformat()),
    ]

    csv_content = ",".join(headers) + "\n" + ",".join(row) + "\n"
    # UTF-8 BOM so Excel opens it correctly
    bom = b"\xef\xbb\xbf"
    output = bom + csv_content.encode("utf-8")

    vendor_safe = "".join(c if c.isalnum() else "_" for c in (extracted.get("vendor_name") or "vendor"))
    filename = f"{vendor_safe}.csv"

    return StreamingResponse(
        io.BytesIO(output),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/save-to-database")
async def api_save_to_database(req: SaveToDatabaseRequest):
    """
    Persist admin-reviewed extraction results into Supabase.
    Only vendors the AI flagged as is_in_malacca are accepted — this endpoint
    enforces that rule server-side too, not just via the disabled frontend state.
    """
    saved, failed = [], []

    for entry in req.vendors:
        job = jobs.get(entry.job_id)
        if not job or job.get("status") != "completed":
            failed.append({"job_id": entry.job_id, "reason": "job not found or not completed"})
            continue

        ext = job.get("extracted") or {}
        if not ext.get("is_in_malacca"):
            failed.append({"job_id": entry.job_id, "reason": "not a Malacca location"})
            continue

        vendor_name = entry.vendor_name or ext.get("vendor_name")
        address     = entry.address or ext.get("address")
        city        = entry.city or ext.get("city")
        state       = entry.state or ext.get("state")

        if not vendor_name:
            failed.append({"job_id": entry.job_id, "reason": "missing vendor_name"})
            continue

        # /create-draft always runs this fuzzy check (see api_create_draft above);
        # this endpoint used to skip it entirely and rely only on upsert_vendor's
        # exact-name guard, letting a near-duplicate ("Legend" vs "Kedai Legend")
        # straight through. Same warn-then-allow-override pattern here.
        if not entry.duplicate_acknowledged:
            try:
                dup_candidates = find_duplicate_vendors(vendor_name, address or "", city or "", state or "")
            except Exception as e:
                failed.append({"job_id": entry.job_id, "reason": f"duplicate check failed: {e}"})
                continue
            if dup_candidates:
                failed.append({"job_id": entry.job_id, "reason": "duplicate", "candidates": dup_candidates})
                continue

        geo = geocode_address(vendor_name, address or "", city or "", state or "")
        platform = "TikTok" if "tiktok" in (job.get("url") or "").lower() else "YouTube"

        row = {
            "vendor_name": vendor_name,
            "address": geo["formatted_address"] if geo else address,
            "state": state,
            "latitude": geo["latitude"] if geo else None,
            "longitude": geo["longitude"] if geo else None,
            "location_precision": geo["precision"] if geo else "unknown",
            "cuisine_types": ", ".join(ext.get("cuisine_types") or []),
            "signature_dishes": ", ".join(ext.get("signature_dishes") or []),
            "price_range": entry.price_range or ext.get("price_range"),
            "sentiment_score": ext.get("sentiment_score"),
            "ai_review_summary": job.get("summary"),
            "operating_hours_raw": entry.operating_hours_raw or ext.get("operating_hours_raw"),
            "source_video_url": job.get("url"),
            "source_platform": platform,
            "status": "draft",
            "last_updated": datetime.now().isoformat(),
        }

        try:
            saved_rows = upsert_vendor(row)
            vendor_row = (saved_rows or [None])[0]
            _attach_ai_thumbnail(vendor_row, job.get("thumbnail"))
            saved.append(entry.job_id)
        except Exception as e:
            failed.append({"job_id": entry.job_id, "reason": str(e)})

    return {"saved": saved, "failed": failed}
