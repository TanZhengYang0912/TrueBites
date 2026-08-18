// Turns a future ISO timestamp into a rough human duration ("1 day", "3
// months") for the main-menu suspension banner. Approximate on purpose — the
// admin picks a round duration (1 day/week/month/year) and this reads back
// close to that whenever it's checked shortly after, without the backend
// having to persist the original choice separately from banned_until.
export function humanizeDuration(untilIso) {
  const ms = new Date(untilIso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "a short time";

  const hours = ms / 3600000;
  if (hours < 24) {
    const n = Math.max(1, Math.round(hours));
    return `${n} hour${n === 1 ? "" : "s"}`;
  }
  const days = hours / 24;
  if (days < 30) {
    const n = Math.round(days);
    return `${n} day${n === 1 ? "" : "s"}`;
  }
  const months = days / 30;
  if (months < 12) {
    const n = Math.round(months);
    return `${n} month${n === 1 ? "" : "s"}`;
  }
  const n = Math.round(days / 365);
  return `${n} year${n === 1 ? "" : "s"}`;
}
