// Video download / audio extraction / TikTok profile scraping — port of
// backend/services/downloader.py. yt-dlp does the actual downloading; ffmpeg
// does the audio conversion (deliberately NOT yt-dlp's own postprocessor —
// that runs an ffprobe codec-check step that fails on some TikTok streams,
// confirmed against the real API in the Python original).
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ytDlp, ffmpeg, impersonateArgs, hasAudioStream } from "./binaries.js";

export const OUTPUTS_DIR = path.resolve("outputs");

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

// Tried in order until one produces a file with a real audio stream —
// TikTok's own combined-stream selector first, then progressively looser
// "give me anything with both audio and video" fallbacks.
const FORMAT_FALLBACKS = [
  "download",
  "best[vcodec!=none][acodec!=none][ext=mp4]",
  "best[vcodec!=none][acodec!=none]",
  "best",
];

async function jobDir(jobId) {
  const dir = path.join(OUTPUTS_DIR, jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// raw_video.mp4 is what we ask yt-dlp for, but it sometimes writes a
// different extension — glob for whatever it actually produced, the same
// way the Python original does, excluding its own .info.json/.part litter.
async function findRawVideo(dir) {
  const entries = await fs.readdir(dir).catch(() => []);
  const hit = entries.find((name) => name.startsWith("raw_video.") && !name.endsWith(".json") && !name.endsWith(".part"));
  return hit ? path.join(dir, hit) : null;
}

async function deleteRawVideo(dir) {
  const existing = await findRawVideo(dir);
  if (existing) await fs.rm(existing, { force: true });
}

async function readInfoJson(dir) {
  const entries = await fs.readdir(dir).catch(() => []);
  const infoFile = entries.find((name) => name.endsWith(".info.json"));
  if (!infoFile) return {};
  try {
    const raw = await fs.readFile(path.join(dir, infoFile), "utf8");
    const data = JSON.parse(raw);
    return { title: data.title || "Unknown Title", thumbnail: data.thumbnail || null };
  } catch {
    return {};
  }
}

async function attemptDownload(url, dir, format) {
  await deleteRawVideo(dir);
  const impersonate = await impersonateArgs();
  const args = [
    "--no-playlist", "--no-check-formats",
    "--format", format,
    "--output", path.join(dir, "raw_video.mp4"),
    "--write-info-json", "--no-write-thumbnail",
    ...impersonate,
    "--user-agent", DESKTOP_UA,
    url,
  ];
  await ytDlp(args, { timeoutMs: 300_000 });
  const rawVideo = await findRawVideo(dir);
  if (!rawVideo) return null;
  if (!(await hasAudioStream(rawVideo))) return null;
  return rawVideo;
}

// Downloads a video, converts to mp3, discards the raw video. Re-encodes to
// mono/16kHz/64kbps (Whisper downsamples to 16kHz mono internally anyway) —
// deliberately smaller than the original's high-VBR stereo output, to stay
// well under Groq's 25MB Whisper upload cap on longer videos.
export async function downloadAudio(url, jobId) {
  const dir = await jobDir(jobId);

  let rawVideo = null;
  for (const format of FORMAT_FALLBACKS) {
    rawVideo = await attemptDownload(url, dir, format);
    if (rawVideo) break;
  }
  if (!rawVideo) throw new Error("Could not download a playable audio/video stream for this URL");

  const audioPath = path.join(dir, "audio.mp3");
  const { code, stderr } = await ffmpeg(
    ["-y", "-i", rawVideo, "-vn", "-ac", "1", "-ar", "16000", "-acodec", "libmp3lame", "-b:a", "64k", audioPath],
    { timeoutMs: 120_000 }
  );
  await fs.rm(rawVideo, { force: true });
  if (code !== 0 || !existsSync(audioPath)) {
    throw new Error(`ffmpeg failed to extract audio: ${stderr.slice(-500)}`);
  }

  const { title, thumbnail } = await readInfoJson(dir);
  return { audio_path: audioPath, title: title || "Unknown Title", thumbnail: thumbnail || null };
}

function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return null;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function absoluteVideoUrl(platform, rawUrl) {
  if (!rawUrl) return null;
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (platform === "tiktok") return `https://www.tiktok.com${rawUrl}`;
  if (platform === "youtube") return `https://www.youtube.com/watch?v=${rawUrl}`;
  return rawUrl;
}

// Lists videos on a profile page without downloading them — used by the
// "paste a profile URL" flow to let an admin pick which videos to process.
export async function scrapeProfile(url, { start = 1, end = 10 } = {}) {
  const clampedStart = Math.max(1, Number(start) || 1);
  const clampedEnd = Math.min(1000, Number(end) || 10);
  const platform = /tiktok\.com/i.test(url) ? "tiktok" : "youtube";

  const impersonate = await impersonateArgs();
  const args = [
    "--flat-playlist",
    "--playlist-items", `${clampedStart}-${clampedEnd}`,
    "--print", "%(.{id,webpage_url,title,thumbnail,duration,view_count})j",
    "--no-warnings",
    "--extractor-args", "tiktok:app_name=trill;device_platform=android;app_version=34.1.2",
    "--socket-timeout", "10",
    "--retries", "1", "--fragment-retries", "0",
    ...impersonate,
    "--user-agent", MOBILE_UA,
    url,
  ];
  const { stdout } = await ytDlp(args, { timeoutMs: 120_000 });

  const videos = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const data = JSON.parse(trimmed);
      videos.push({
        id: data.id,
        url: absoluteVideoUrl(platform, data.webpage_url || data.id),
        title: data.title || null,
        thumbnail: data.thumbnail || null,
        duration: formatDuration(data.duration),
        view_count: data.view_count ?? null,
      });
    } catch {
      // Unparseable line — same as the Python original's bare except, skip it.
    }
  }
  return { videos, platform };
}
