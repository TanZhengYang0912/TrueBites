// Trip panel display preferences. Separate from tripStorage.js on purpose: that
// holds trip *content* the user built, this holds how they like the panel laid
// out. Losing one should never lose the other.
const STORAGE_KEY = "truebites:panel";

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // corrupt or unavailable storage — fall back to defaults
  }
}

<<<<<<< Updated upstream
export function loadNearbyCollapsed() {
  return read().nearbyCollapsed === true;
}

export function saveNearbyCollapsed(collapsed) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), nearbyCollapsed: collapsed }));
=======
const TABS = ["trip", "vendors"];

export function loadPanelTab() {
  const tab = read().tab;
  return TABS.includes(tab) ? tab : "trip";
}

export function savePanelTab(tab) {
  if (!TABS.includes(tab)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), tab }));
>>>>>>> Stashed changes
  } catch {
    // storage full/unavailable — the preference just won't survive this reload
  }
}
