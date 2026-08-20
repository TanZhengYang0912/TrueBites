// External-binary orchestration shared by every AI module — ffmpeg/ffprobe
// (video/audio processing) and yt-dlp (video download). These were always
// external processes even when a Python service launched them; this module
// is the Node equivalent of backend/services/downloader.py's binary
// resolution + the subprocess.run() wrapper every Python service function
// used.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

// yt-dlp resolution order: explicit override -> the standalone binary
// scripts/installYtDlp.js fetches into backend/bin/ (deliberately preferred
// over anything on PATH — a plain `pip install yt-dlp` or an old cached
// binary is exactly what breaks TikTok extraction; see that script's header)
// -> bare "yt-dlp" as a last resort, relying on PATH.
function resolveYtDlp() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const bundled = path.resolve("bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  if (existsSync(bundled)) return bundled;
  return "yt-dlp";
}

// ffmpeg/ffprobe resolution order: explicit override -> the prebuilt binary
// ffmpeg-static/ffprobe-static already downloaded into node_modules during
// `npm install` (win32/darwin/linux, no system package manager, no Docker —
// this is what makes the AI pipeline actually work on Render's plain Node
// runtime, which has neither ffmpeg nor apt-get available) -> bare
// "ffmpeg"/"ffprobe" as a last resort if the platform/arch combo is one
// those packages don't ship a binary for.
const FFMPEG = process.env.FFMPEG_PATH || ffmpegStaticPath || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic?.path || "ffprobe";
// Resolved once per process, not per call — installYtDlp.js only runs
// occasionally, not mid-request.
const YT_DLP = resolveYtDlp();

// Every call site needs "did it succeed" without a try/catch, since format
// fallback ladders (downloader.js) and CLI failures are expected, routine
// outcomes here, not exceptional ones — matches subprocess.run()'s
// non-raising default in the Python original more closely than
// child_process's promisified throw-on-nonzero-exit behaviour would.
export function run(cmd, args, { timeoutMs = 60_000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        code: error?.code ?? 0,
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        timedOut: Boolean(error?.killed && error.signal === "SIGTERM"),
      });
    });
  });
}

export const ffmpeg = (args, opts) => run(FFMPEG, args, opts);
export const ffprobe = (args, opts) => run(FFPROBE, args, opts);
export const ytDlp = (args, opts) => run(YT_DLP, args, opts);

// Port of downloader.py's _impersonate_args — TikTok's anti-bot check is a
// TLS/JA3 fingerprint check; yt-dlp's curl_cffi backend can impersonate a
// real browser's fingerprint, but only for whichever Chrome-NNN targets
// THIS installed yt-dlp build actually supports. Cache the resolved args as
// a promise (not a value) so concurrent first-callers share one
// `--list-impersonate-targets` call instead of each spawning it.
const PREFERRED_TARGETS = ["Chrome-120", "Chrome-131", "Chrome-133"];
let impersonateArgsPromise = null;

// Pure — parses `yt-dlp --list-impersonate-targets` stdout and picks which
// one to use. Separated from the subprocess call so it's unit-testable
// without needing yt-dlp installed.
export function selectImpersonateTarget(stdout) {
  const targets = [];
  for (const line of String(stdout || "").split("\n")) {
    const match = line.match(/^\s*(Chrome-\d+(?:\.\d+)?)\s+/);
    if (match) targets.push(match[1]);
  }
  if (!targets.length) return null;
  return PREFERRED_TARGETS.find((t) => targets.includes(t)) || targets[0];
}

async function resolveImpersonateArgs() {
  const { code, stdout } = await run(YT_DLP, ["--list-impersonate-targets"], { timeoutMs: 15_000 });
  if (code !== 0) return [];
  const target = selectImpersonateTarget(stdout);
  return target ? ["--impersonate", target] : [];
}

export function impersonateArgs() {
  if (!impersonateArgsPromise) impersonateArgsPromise = resolveImpersonateArgs();
  return impersonateArgsPromise;
}

// Port of downloader.py's audio-stream check — TikTok's own metadata
// sometimes claims a download has audio when the actual downloaded stream
// doesn't (silent slideshow posts, etc), so this checks the real file.
export async function hasAudioStream(filePath) {
  const { code, stdout } = await ffprobe(
    ["-v", "quiet", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", filePath],
    { timeoutMs: 15_000 }
  );
  return code === 0 && stdout.trim().length > 0;
}
