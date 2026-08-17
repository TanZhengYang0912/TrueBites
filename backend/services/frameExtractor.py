"""
On-demand video-frame extraction for the Vendor Photos feature.

Separate from downloader.py's download_audio() pipeline (which downloads a
video purely to strip its audio, then deletes it within the same call) —
this module is triggered independently, per-vendor, whenever an admin clicks
"Find Photos Automatically" for a vendor that has a source_video_url. It
re-downloads that same video (yt-dlp), grabs a handful of candidate frames at
evenly-spaced timestamps via ffmpeg, filters out unusable ones (too dark, too
blurry, near-duplicate of one already kept), and returns the best few as
local JPEG files for the admin to preview before anything is committed to a
vendor's photos.

Frames are never uploaded anywhere by this module — routes/process.py serves
them as static files for the Node backend to fetch (and re-host in Supabase
Storage) only once an admin picks one, mirroring how the Mapillary/Flickr/
TikTok-oEmbed candidates already work on the Node side.
"""
import subprocess
import statistics
import threading
import urllib.request
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageFilter

from services.downloader import OUTPUTS_DIR, FFMPEG, FFPROBE, YT_DLP, _impersonate_args

MAX_CANDIDATE_TIMESTAMPS = 10   # frames attempted before filtering
MAX_RETURNED_FRAMES = 5         # best frames kept after filtering
DARKNESS_THRESHOLD = 25         # mean grayscale value (0-255) below this = "too dark"
SHARPNESS_THRESHOLD = 80        # edge-variance below this = "too blurry"
DUPLICATE_HASH_DISTANCE = 6     # aHash bits (out of 64) below this = "near-duplicate"
# TikTok food creators frequently talk to camera — those "talking head" shots
# are the least useful frame for a vendor card (we want the storefront/food,
# not the reviewer). Measured against real footage: a clearly face-dominant
# frame (creator looking at the camera, face filling a large part of the
# shot) had a face box of 140x211 in a 720x1280 (portrait) frame — only 3.2%
# of the total PIXEL AREA, because so much of a tall vertical video is empty
# space above/below the subject. Area-fraction is misleading for portrait
# video; width-fraction (140/720 = 19.4%) matches how prominent the face
# actually looks, so that's the metric used, not raw area.
MAX_FACE_WIDTH_FRACTION = 0.16

# Face detection: tried the classic Haar cascade first (cv2.CascadeClassifier,
# bundled with opencv-python — zero downloads) but on real footage it missed
# an obvious, prominent face entirely (she was looking down at the food, not
# straight at the camera) while flagging a false positive elsewhere in the
# frame — Haar cascades are known to be unreliable outside near-frontal,
# upright poses, which food-vlog footage rarely is. Switched to YuNet, a
# small (~230KB) DNN detector that's robust to angle/pose — OpenCV's own
# modern replacement for Haar cascades (in fact OpenCV 5.0 removed
# CascadeClassifier entirely in favour of this). The model isn't bundled with
# the pip package, so it's downloaded once and cached locally.
_YUNET_MODEL_PATH = Path(__file__).parent.parent / "models" / "face_detection_yunet_2023mar.onnx"
_YUNET_MODEL_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
_face_detector_lock = threading.Lock()
_face_detector = None       # lazily created cv2.FaceDetectorYN
_face_detector_unavailable = False  # sticky flag once download/load fails — don't retry every frame


def _ensure_yunet_model() -> Path | None:
    if _YUNET_MODEL_PATH.exists():
        return _YUNET_MODEL_PATH
    try:
        _YUNET_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = _YUNET_MODEL_PATH.with_suffix(".onnx.part")
        urllib.request.urlretrieve(_YUNET_MODEL_URL, str(tmp_path))
        tmp_path.rename(_YUNET_MODEL_PATH)
        return _YUNET_MODEL_PATH
    except Exception:
        return None


def _get_face_detector(width: int, height: int):
    # Face-filtering is a nice-to-have on top of extraction, not something
    # that should ever be able to break it — any failure here (no internet
    # for the one-time model download, a corrupt cache, etc) just disables
    # face-filtering for this run rather than raising.
    global _face_detector, _face_detector_unavailable
    if _face_detector_unavailable:
        return None
    with _face_detector_lock:
        if _face_detector_unavailable:
            return None
        try:
            model_path = _ensure_yunet_model()
            if model_path is None:
                raise RuntimeError("YuNet model unavailable")
            if _face_detector is None:
                _face_detector = cv2.FaceDetectorYN.create(str(model_path), "", (width, height))
            else:
                _face_detector.setInputSize((width, height))
            return _face_detector
        except Exception:
            _face_detector_unavailable = True
            return None


def _get_duration_seconds(video_path: Path) -> float:
    result = subprocess.run(
        [
            FFPROBE, "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            str(video_path),
        ],
        capture_output=True, text=True, timeout=30,
    )
    try:
        return float(result.stdout.strip())
    except (ValueError, TypeError):
        return 0.0


def _extract_frame_at(video_path: Path, timestamp: float, out_path: Path) -> bool:
    result = subprocess.run(
        [
            FFMPEG, "-y",
            "-ss", f"{timestamp:.2f}",
            "-i", str(video_path),
            "-frames:v", "1",
            "-q:v", "2",
            str(out_path),
        ],
        capture_output=True, text=True, timeout=30,
    )
    return result.returncode == 0 and out_path.exists()


def _brightness(gray_img: Image.Image) -> float:
    return statistics.mean(gray_img.getdata())


def _sharpness(gray_img: Image.Image) -> float:
    # Cheap, dependency-free stand-in for variance-of-Laplacian: a sharp
    # image has strong, varied edges; a blurry one's edge map is flat.
    edges = gray_img.filter(ImageFilter.FIND_EDGES)
    return statistics.pvariance(edges.getdata())


def _average_hash(gray_img: Image.Image) -> int:
    small = gray_img.resize((8, 8), Image.LANCZOS)
    pixels = list(small.getdata())
    avg = sum(pixels) / len(pixels)
    bits = 0
    for i, p in enumerate(pixels):
        if p > avg:
            bits |= (1 << i)
    return bits


def _hamming_distance(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def _largest_face_width_fraction(color_img: Image.Image) -> float:
    """The largest detected face's width as a fraction of the frame's width
    (0 if none, or if the detector couldn't be loaded — see
    _get_face_detector). Needs a COLOR image (YuNet expects 3-channel BGR),
    unlike the brightness/sharpness/hash checks which work on grayscale."""
    width, height = color_img.size
    detector = _get_face_detector(width, height)
    if detector is None:
        return 0.0
    bgr = cv2.cvtColor(np.array(color_img.convert("RGB")), cv2.COLOR_RGB2BGR)
    with _face_detector_lock:
        _, faces = detector.detect(bgr)
    if faces is None or len(faces) == 0:
        return 0.0
    # Each row is [x, y, w, h, <5 landmark x/y pairs>, confidence].
    largest_face_width = max(face[2] for face in faces)
    return largest_face_width / width


def _download_video(url: str, job_dir: Path) -> Path:
    """Download a single video file (video+audio, any playable container) —
    mirrors downloader.py's format-fallback approach, but keeps the video
    (frame extraction needs it) instead of discarding it after audio strip."""
    raw = job_dir / "frame_source.mp4"
    for old in job_dir.glob("frame_source.*"):
        try:
            old.unlink()
        except Exception:
            pass

    cmd = [
        YT_DLP, "--no-playlist", "--no-check-formats",
        "--format", "best[vcodec!=none]",
        "--output", str(raw),
        "--no-write-thumbnail", "--no-write-info-json",
    ]
    cmd += list(_impersonate_args(YT_DLP))
    cmd += [
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    actual = raw
    if not actual.exists():
        candidates = [f for f in job_dir.glob("frame_source.*") if f.suffix.lower() not in (".json", ".part")]
        if candidates:
            actual = candidates[0]

    if result.returncode != 0 or not actual.exists():
        raise RuntimeError(f"yt-dlp could not download this video: {result.stderr[-300:] if result.stderr else 'unknown error'}")

    return actual


def extract_frames(video_url: str, job_id: str) -> list[dict]:
    """
    Downloads `video_url`, extracts up to MAX_CANDIDATE_TIMESTAMPS candidate
    frames, filters out ones that are too dark/blurry/near-duplicate, and
    returns up to MAX_RETURNED_FRAMES survivors sorted best-first.

    Returns: [{ "path": Path, "sharpness": float, "brightness": float }, ...]
    Raises RuntimeError on download failure — callers should treat that the
    same way a "no candidates found" result from any other provider is
    treated (never crash the discovery request).
    """
    job_dir = OUTPUTS_DIR / job_id
    job_dir.mkdir(exist_ok=True)
    frames_dir = job_dir / "frames"
    frames_dir.mkdir(exist_ok=True)
    # Clear any frames left from a previous search for this job id.
    for old in frames_dir.glob("*.jpg"):
        try:
            old.unlink()
        except Exception:
            pass

    video_path = _download_video(video_url, job_dir)
    try:
        duration = _get_duration_seconds(video_path)
        if duration <= 0:
            duration = 15.0  # sane fallback for a short-form video if ffprobe fails

        # Evenly-spaced timestamps, skipping the first/last 5% (intro/outro
        # title cards are the least useful frames for "what does this place
        # look like").
        margin = duration * 0.05
        usable = max(duration - 2 * margin, duration * 0.5)
        step = usable / MAX_CANDIDATE_TIMESTAMPS
        timestamps = [margin + step * i for i in range(MAX_CANDIDATE_TIMESTAMPS)]

        kept: list[dict] = []
        seen_hashes: list[int] = []
        for i, ts in enumerate(timestamps):
            out_path = frames_dir / f"frame_{i:02d}.jpg"
            if not _extract_frame_at(video_path, ts, out_path):
                continue

            with Image.open(out_path) as img:
                gray = img.convert("L")
                brightness = _brightness(gray)
                if brightness < DARKNESS_THRESHOLD:
                    out_path.unlink(missing_ok=True)
                    continue

                sharpness = _sharpness(gray)
                if sharpness < SHARPNESS_THRESHOLD:
                    out_path.unlink(missing_ok=True)
                    continue

                if _largest_face_width_fraction(img) > MAX_FACE_WIDTH_FRACTION:
                    out_path.unlink(missing_ok=True)
                    continue

                frame_hash = _average_hash(gray)

            if any(_hamming_distance(frame_hash, h) < DUPLICATE_HASH_DISTANCE for h in seen_hashes):
                out_path.unlink(missing_ok=True)
                continue

            seen_hashes.append(frame_hash)
            kept.append({"path": out_path, "sharpness": sharpness, "brightness": brightness})

        kept.sort(key=lambda f: f["sharpness"], reverse=True)
        return kept[:MAX_RETURNED_FRAMES]
    finally:
        # Same "clean up the raw video, keep only what we actually need"
        # convention download_audio() uses.
        try:
            video_path.unlink(missing_ok=True)
        except Exception:
            pass
