let cachedBookmarks = null;
let cachedFolders = null;

export function getCachedBookmarks() {
  return cachedBookmarks;
}

export function getCachedFolders() {
  return cachedFolders;
}

export function setCachedBookmarks(bookmarks) {
  cachedBookmarks = bookmarks;
}

export function setCachedFolders(folders) {
  cachedFolders = folders;
}

// Clears the cache on sign-out so the next account doesn't see stale bookmarks.
export function clearBookmarksCache() {
  cachedBookmarks = null;
  cachedFolders = null;
}
