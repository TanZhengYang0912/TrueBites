/**
 * One-shot cleanup for backend/outputs/ — the AI pipeline's job-artifact
 * directories (audio, transcripts, extracted frames). The Python service
 * this replaced never cleaned these up at all; by the time this script was
 * written there were 1,500+ leftover directories on disk. The running
 * server now sweeps this automatically (see lib/ai/jobStore.js
 * startOutputsSweeper, default 24h TTL) — this script is for clearing an
 * existing backlog in one go, or for an ad-hoc cleanup outside that window.
 *
 * Usage:
 *   node scripts/cleanOutputs.js --older-than-hours=24 --yes
 */
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const CONFIRMED = flag("yes");
const OLDER_THAN_HOURS = Number(opt("older-than-hours", "24"));
const OUTPUTS_DIR = path.resolve("outputs");

async function main() {
  const ttlMs = OLDER_THAN_HOURS * 60 * 60 * 1000;
  const entries = await fs.readdir(OUTPUTS_DIR, { withFileTypes: true }).catch(() => []);
  const now = Date.now();

  const toDelete = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(OUTPUTS_DIR, entry.name);
    const stat = await fs.stat(dirPath).catch(() => null);
    if (stat && now - stat.mtimeMs >= ttlMs) toDelete.push(dirPath);
  }

  console.log(`📄  ${entries.length} director${entries.length === 1 ? "y" : "ies"} in outputs/ | ${toDelete.length} older than ${OLDER_THAN_HOURS}h`);

  if (!CONFIRMED) {
    console.log("   Dry run — pass --yes to actually delete them.");
    return;
  }

  let deleted = 0;
  for (const dirPath of toDelete) {
    await fs.rm(dirPath, { recursive: true, force: true });
    deleted++;
  }
  console.log(`✅  Deleted ${deleted} director${deleted === 1 ? "y" : "ies"}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
