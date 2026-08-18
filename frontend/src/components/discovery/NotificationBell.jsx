import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, RotateCcw, ShieldAlert } from "lucide-react";
import { getNotifications, markNotificationsSeen, markNotificationRead, resetNotificationsSeen, getAccountStatus } from "../../api/engagement";
import { unreadCount, isUnread } from "../../lib/notifications";
import { categoryLabel } from "../../lib/vendorDisplay";

// Signed-in customers only — DiscoveryHeader decides that. Fetches its own data
// on mount so all three surfaces (Dashboard, MapPage, EngagementPage) get the
// bell without threading props through any of them.
export default function NotificationBell({ onOpenVendor }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [readIds, setReadIds] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [suspension, setSuspension] = useState(null);
  const wrapRef = useRef(null);

  // Fetches once on mount; a newly-published vendor won't appear until this
  // runs again, so the dropdown also exposes a manual refresh.
  function load() {
    setLoading(true);
    return getNotifications()
      .then((payload) => {
        setItems(payload.notifications || []);
        setLastSeenAt(payload.lastSeenAt || null);
        setReadIds(payload.readIds || []);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getAccountStatus().then(setSuspension).catch(() => {});
  }, []);

  // Close on outside click and on Escape — a dropdown that traps the page is
  // worse than no dropdown.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const unread = unreadCount(items, lastSeenAt, readIds);

  async function markSeen() {
    try {
      const { lastSeenAt: seenAt } = await markNotificationsSeen();
      setLastSeenAt(seenAt);
      setReadIds([]);
    } catch (err) {
      setError(err.message);
    }
  }

  // Opening a notification reads that one. Updated locally first so the badge
  // drops before the dropdown closes — the server call is confirmation, not
  // the thing the user is waiting on.
  function openNotification(id) {
    setReadIds((current) => (current.includes(id) ? current : [...current, id]));
    setOpen(false);
    onOpenVendor?.(id);
    markNotificationRead(id).catch((err) => setError(err.message));
  }

  async function resetSeen() {
    setLoading(true);
    try {
      await resetNotificationsSeen();
      setLastSeenAt(null);
      setReadIds([]);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        className="relative grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-forest"
      >
        <Bell size={18} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-terracotta px-1 text-[10px] font-bold tabular-nums text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[300px] overflow-hidden rounded-xl border border-sand bg-white shadow-[0_10px_34px_rgba(64,84,74,0.22)]">
          <div className="flex items-center justify-between border-b border-sand bg-chalk px-3 py-2">
            <span className="font-display text-[13px] font-bold text-forest">New places</span>
            <div className="flex items-center gap-1.5">
              {unread > 0 && (
                <span className="rounded-full bg-forest px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">
                  {unread} new
                </span>
              )}
              <button
                type="button"
                onClick={resetSeen}
                disabled={loading}
                title="Reset to unread (demo)"
                aria-label="Reset notifications to unread"
                className="inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold text-muted hover:text-forest disabled:opacity-50"
              >
                <RotateCcw size={12} strokeWidth={1.8} className={loading ? "animate-spin" : ""} />
                Reset
              </button>
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {suspension?.suspended && (
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/account-suspended"); }}
                className="flex w-full items-start gap-2 border-b border-sand bg-terracotta/10 px-3 py-2 text-left hover:bg-terracotta/15"
              >
                <ShieldAlert size={13} className="mt-1 shrink-0 text-terracotta" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold text-terracotta">Account suspended</span>
                  <span className="block text-[11px] text-terracotta/80">Tap to see the reason and what you can do</span>
                </span>
              </button>
            )}
            {error ? (
              <div className="px-3 py-4 text-[12px] text-danger">{error}</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-muted">No new places yet.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openNotification(item.id)}
                  className="flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left hover:bg-chalk"
                >
                  <span
                    aria-hidden="true"
                    className={isUnread(item, lastSeenAt, readIds)
                      ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-terracotta"
                      : "mt-1.5 size-1.5 shrink-0 rounded-full bg-transparent"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{item.name}</span>
                    <span className="block text-[11px] text-muted">
                      {[categoryLabel(item), relativeDay(item.published_at)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          {unread > 0 && (
            <button
              type="button"
              onClick={markSeen}
              className="min-h-11 w-full border-t border-sand text-[12px] font-semibold text-forest hover:bg-chalk"
            >
              Mark all read
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// "2 days ago" without pulling in a date library for one label.
function relativeDay(iso) {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}
