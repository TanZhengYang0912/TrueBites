/**
 * Fetches a standalone yt-dlp binary into backend/bin/ (gitignored) so the
 * Node AI service never depends on a Python install to have yt-dlp on PATH.
 * Cross-platform — picks the right release asset for whichever OS this runs
 * on and writes it to the path lib/ai/binaries.js already expects
 * ("bin/yt-dlp.exe" on Windows, "bin/yt-dlp" elsewhere).
 *
 * Deliberately pulls from the NIGHTLY builds repo, not the stable release —
 * confirmed live on 2026-08-19 that the current stable tag (2026.07.04) is
 * already broken against TikTok ("Unable to extract universal data for
 * rehydration"; TikTok changed something server-side), while the nightly
 * build from the following day works. yt-dlp vs. TikTok is an ongoing arms
 * race — if downloads start failing again, re-run this script first before
 * assuming anything else is broken.
 *
 * Uses the FULL build for each platform (yt-dlp.exe / yt-dlp_macos /
 * yt-dlp_linux — never a _min or x86 variant) — only the full build bundles
 * curl_cffi, which is what actually lets --impersonate work (TikTok's
 * anti-bot TLS/JA3 fingerprint check). A build without it will download
 * nothing from TikTok, silently.
 *
 * Usage:
 *   node scripts/installYtDlp.js
 */
import fs from "fs";
import path from "path";
import https from "https";

const NIGHTLY_API = "https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest";
const BIN_DIR = path.resolve("bin");

// Asset naming is yt-dlp's own release convention (github.com/yt-dlp/yt-dlp
// -nightly-builds/releases) — not something this project controls.
const ASSET_NAME_BY_PLATFORM = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};
const ASSET_NAME = ASSET_NAME_BY_PLATFORM[process.platform];
const OUT_PATH = path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "truebites-installYtDlp" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    }).on("error", reject);
  });
}

function downloadFile(url, outPath) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "truebites-installYtDlp" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, outPath));
      }
      if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(outPath);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  if (!ASSET_NAME) {
    throw new Error(
      `Unsupported platform "${process.platform}" — yt-dlp nightly builds only publish ` +
      `standalone binaries for win32/darwin/linux. Install yt-dlp yourself and set YTDLP_PATH.`
    );
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });

  console.log("📄  Fetching latest yt-dlp nightly release info…");
  const release = await fetchJson(NIGHTLY_API);
  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset) throw new Error(`Could not find ${ASSET_NAME} in the latest nightly release assets`);

  console.log(`📄  ${release.tag_name} — downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)…`);
  await downloadFile(asset.browser_download_url, OUT_PATH);
  if (process.platform !== "win32") fs.chmodSync(OUT_PATH, 0o755);
  console.log(`✅  Saved to ${OUT_PATH}`);
  console.log("   Verifying --impersonate support (should list real Chrome-NNN targets below):");
}

// Runs as a postinstall hook, so a flaky network (or a build sandbox like
// Render's that blocks outbound GitHub access) must not fail `npm install`
// itself — warn and exit 0 rather than exit(1). `npm run setup:ytdlp` run
// by hand surfaces the same message; it's just not fatal here.
main().catch((err) => {
  console.error("⚠️  Could not fetch yt-dlp:", err.message);
  console.error("   The AI video pipeline needs it — re-run `npm run setup:ytdlp` once you have network access.");
});
