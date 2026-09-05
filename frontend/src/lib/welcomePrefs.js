// Whether this browser has already dismissed the Discover-page welcome
// slideshow. Same shape as panelPrefs.js: a single try/catch'd read/write so
// a blocked or full localStorage degrades to "already seen" rather than
// throwing or re-showing the popup on every load.
const STORAGE_KEY = "truebites:welcome-seen";

export function hasSeenWelcome() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markWelcomeSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // storage full/unavailable — the popup will just show again next time
  }
}
