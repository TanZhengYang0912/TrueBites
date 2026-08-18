from pathlib import Path
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from routes.process import router as process_router

#MAIN

app = FastAPI(
    title="AI Content Processing Module",
    description="TikTok/YouTube video processing with Whisper + Ollama",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AI_INTERNAL_KEY = os.getenv("AI_INTERNAL_KEY", "")


@app.middleware("http")
async def require_internal_api_key(request: Request, call_next):
    # The Node admin API is the intended caller. Keep local setups without a
    # configured key backwards-compatible, but enforce the boundary whenever
    # AI_INTERNAL_KEY is configured in a real environment.
    if AI_INTERNAL_KEY and request.url.path.startswith("/api"):
        if request.headers.get("x-internal-key") != AI_INTERNAL_KEY:
            return JSONResponse(status_code=401, content={"detail": "AI service is internal-only"})
    return await call_next(request)

app.include_router(process_router, prefix="/api")

# Serves extracted candidate frames (backend/outputs/<job_id>/frames/*.jpg) so
# the Node backend can fetch+re-host whichever one an admin picks — the same
# "preview via an external URL, download only on commit" pattern already used
# for Mapillary/Flickr/TikTok candidates. Nothing else in outputs/ is meant
# for public consumption, but audio/transcript/status files hold nothing
# sensitive and this mirrors the existing job-artifact filesystem layout
# rather than introducing a second one.
app.mount("/outputs", StaticFiles(directory=str(Path(__file__).parent / "outputs")), name="outputs")


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "AI Content Processing Module"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
