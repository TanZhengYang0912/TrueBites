from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
