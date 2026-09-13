import { useEffect, useState } from "react";
import { getBookmarks } from "../api/engagement";

let cachedCount = null;
const listeners = new Set();

function setCount(count) {
  cachedCount = count;
  listeners.forEach((fn) => fn(count));
}

// Clears the cache on sign-out so the next account doesn't see a stale count.
export function clearSavedCount() {
  setCount(null);
}

// Lets a page that already fetched its own bookmark list update the shared count.
export function reportSavedCount(count) {
  setCount(count);
}

function refreshSavedCount() {
  return getBookmarks()
    .then((res) => setCount(res.bookmarks.length))
    .catch(() => {});
}

// Returns the shared saved-count; pass fetchIfStale=true from one place per page to refresh it.
export function useSavedCount(fetchIfStale) {
  const [count, setLocalCount] = useState(cachedCount ?? 0);

  useEffect(() => {
    listeners.add(setLocalCount);
    if (fetchIfStale) refreshSavedCount();
    return () => listeners.delete(setLocalCount);
  }, [fetchIfStale]);

  return count;
}
