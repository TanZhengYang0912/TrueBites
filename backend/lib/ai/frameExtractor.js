// Video frame candidate extraction for vendor gallery photos — port of
// backend/services/frameExtractor.py, minus the face-avoidance filter
// (deliberately dropped: replicating OpenCV's FaceDetectorYN/YuNet decode
// faithfully in Node needs a full anchor-generation + NMS reimplementation
// for a filter that's a quality nicety, not core functionality — not worth
// it here). Darkness, sharpness, and duplicate-hash filtering are kept,
// ported to the same constants and (as closely as JS allows) the same math.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ytDlp, ffmpeg, ffprobe, impersonateArgs } from "./binaries.js";
import { OUTPUTS_DIR } from "./downloader.js";

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_CANDIDATE_TIMESTAMPS = 10;
const MAX_RETURNED_FRAMES = 5;
const DARKNESS_THRESHOLD = 25;        // mean grayscale value (0-255) below this = "too dark"
// Lowered from 80 on 2026-08-19 — handheld TikTok food shots are rarely
// tripod-sharp, and 80 was rejecting usable, recognisable food frames along
// with the truly unusable ones. Carried over unchanged from
// backend/services/frameExtractor.py's own tuning history.
const SHARPNESS_THRESHOLD = 55;
const DUPLICATE_HASH_DISTANCE = 6;    // aHash bits (out of 64) below this = "near-duplicate"

// ── Pure, dependency-free math — unit-testable without ffmpeg/sharp ────────

// Evenly-spaced candidate timestamps across a video, skipping the first/last
// 5% (title cards, transitions), but never sampling less than the middle
// 50% of the video even if that margin would otherwise eat more. Falls back
// to assuming a 15s clip when ffprobe can't report a real duration, rather
// than producing zero candidates.
export function candidateTimestamps(durationSeconds) {
  let duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) duration = 15;

  const margin = duration * 0.05;
  const usable = Math.max(duration - 2 * margin, duration * 0.5);
  const step = usable / MAX_CANDIDATE_TIMESTAMPS;

  const timestamps = [];
  for (let i = 0; i < MAX_CANDIDATE_TIMESTAMPS; i++) timestamps.push(margin + step * i);
  return timestamps;
}

// Mean of a grayscale pixel buffer — PIL's statistics.mean(gray.getdata()).
export function brightnessOf(grayBuffer) {
  let sum = 0;
  for (let i = 0; i < grayBuffer.length; i++) sum += grayBuffer[i];
  return grayBuffer.length ? sum / grayBuffer.length : 0;
}

// PIL's ImageFilter.FIND_EDGES kernel — a discrete Laplacian. Applied
// manually (not via sharp's convolve) so border-pixel handling matches
// PIL's own convention exactly: edge pixels the 3x3 window can't fully
// cover are passed through unfiltered rather than clamped/extended.
const EDGE_KERNEL = [-1, -1, -1, -1, 8, -1, -1, -1, -1];

export function applyFindEdges(grayBuffer, width, height) {
  const out = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out[idx] = grayBuffer[idx];
        continue;
      }
      let sum = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += grayBuffer[idx + dy * width + dx] * EDGE_KERNEL[k++];
        }
      }
      out[idx] = Math.max(0, Math.min(255, sum));
    }
  }
  return out;
}

// Population variance (÷N, not N-1) — PIL's statistics.pvariance. A common
// off-by-one-flavour bug source if swapped for sample variance.
export function populationVariance(buffer) {
  const n = buffer.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buffer[i];
  const mean = sum / n;
  let sqDiff = 0;
  for (let i = 0; i < n; i++) {
    const d = buffer[i] - mean;
    sqDiff += d * d;
  }
  return sqDiff / n;
}

// "Cheap, dependency-free stand-in for variance-of-Laplacian" — same
// framing as the Python original: NOT cv2's Laplacian, a Pillow-style
// edge-filter variance instead.
export function sharpnessOf(grayBuffer, width, height) {
  return populationVariance(applyFindEdges(grayBuffer, width, height));
}

// Classic average hash (aHash): mean-threshold each of 64 pixels (8x8,
// already resized+grayscaled by the caller), pack into a 64-bit value.
// Uses BigInt deliberately — `1 << i` on a plain Number breaks past bit 31.
export function averageHash(pixels64) {
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += pixels64[i];
  const avg = sum / 64;
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    if (pixels64[i] > avg) bits |= (1n << BigInt(i));
  }
  return bits;
}

export function hammingDistance(a, b) {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

// ── Image decoding (sharp) ──────────────────────────────────────────────────

async function decodeGrayscale(filePath) {
  const { data, info } = await sharp(filePath).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Lanczos3 is sharp's closest match to PIL's Image.LANCZOS; fit:"fill"
// forces an exact 8x8 regardless of aspect ratio, matching PIL's
// resize((8,8), ...) distortion (not a centre-crop).
async function decodeHashPixels(filePath) {
  const { data } = await sharp(filePath)
    .greyscale()
    .resize(8, 8, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

// ── ffmpeg/yt-dlp orchestration ─────────────────────────────────────────────

async function videoDuration(videoPath) {
  const { code, stdout } = await ffprobe(
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath],
    { timeoutMs: 15_000 }
  );
  if (code !== 0) return 0;
  return parseFloat(stdout.trim()) || 0;
}

async function extractFrameAt(videoPath, timestamp, outPath) {
  const { code } = await ffmpeg(
    ["-y", "-ss", timestamp.toFixed(2), "-i", videoPath, "-frames:v", "1", "-q:v", "2", outPath],
    { timeoutMs: 30_000 }
  );
  return code === 0 && existsSync(outPath);
}

// Downloads the video (single attempt, video-only-is-fine format — audio
// doesn't matter for frames), extracts up to MAX_CANDIDATE_TIMESTAMPS
// frames, filters each (darkness -> sharpness -> duplicate-hash, reject on
// first failure), keeps the sharpest MAX_RETURNED_FRAMES, deletes the
// source video. Returns [{ path, filename, sharpness, brightness }] — the
// caller builds public URLs, this module only knows about the filesystem.
export async function extractFrames(videoUrl, jobId) {
  const dir = path.join(OUTPUTS_DIR, jobId);
  const framesDir = path.join(dir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  const videoPath = path.join(dir, "frame_source.mp4");
  const impersonate = await impersonateArgs();
  await ytDlp(
    [
      "--no-playlist", "--no-check-formats",
      "--format", "best[vcodec!=none]",
      "--output", videoPath,
      "--no-write-thumbnail", "--no-write-info-json",
      ...impersonate,
      "--user-agent", DESKTOP_UA,
      videoUrl,
    ],
    { timeoutMs: 300_000 }
  );
  if (!existsSync(videoPath)) throw new Error("Could not download video for frame extraction");

  try {
    const duration = await videoDuration(videoPath);
    const timestamps = candidateTimestamps(duration);
    const kept = [];
    const seenHashes = [];

    for (let i = 0; i < timestamps.length; i++) {
      const framePath = path.join(framesDir, `frame_${String(i).padStart(2, "0")}.jpg`);
      const ok = await extractFrameAt(videoPath, timestamps[i], framePath);
      if (!ok) continue;

      const { data, width, height } = await decodeGrayscale(framePath);

      const brightness = brightnessOf(data);
      if (brightness < DARKNESS_THRESHOLD) { await fs.rm(framePath, { force: true }); continue; }

      const sharpness = sharpnessOf(data, width, height);
      if (sharpness < SHARPNESS_THRESHOLD) { await fs.rm(framePath, { force: true }); continue; }

      const hash = averageHash(await decodeHashPixels(framePath));
      const isDuplicate = seenHashes.some((h) => hammingDistance(h, hash) < DUPLICATE_HASH_DISTANCE);
      if (isDuplicate) { await fs.rm(framePath, { force: true }); continue; }

      seenHashes.push(hash);
      kept.push({ path: framePath, filename: path.basename(framePath), sharpness, brightness });
    }

    kept.sort((a, b) => b.sharpness - a.sharpness);
    return kept.slice(0, MAX_RETURNED_FRAMES);
  } finally {
    await fs.rm(videoPath, { force: true });
  }
}
