// The unread rule for the discovery notification bell. Pure on purpose: the
// badge count and the per-row "new" dot both read it, and when that logic was
// duplicated they drifted — the badge said 3 while two rows looked new.

// How many notifications the bell ever shows. The dropdown is a glance, not an
// archive; the full catalogue is the discovery grid.
export const NOTIFICATION_LIMIT = 15;

// A vendor is unread when it went live after the user last opened the bell and
// they have not opened that one notification individually. No last-seen at all
// means the user has never opened it, so everything is unread — that first
// badge is what teaches them the bell is there.
//
// Two mechanisms because one cannot do both jobs: `lastSeenAt` is a watermark
// ("everything before this moment is read") which is what "Mark all read"
// needs, while `readIds` is the exception list that lets a single item go read
// while newer ones stay unread.
export function unreadCount(notifications = [], lastSeenAt = null, readIds = []) {
  const list = Array.isArray(notifications) ? notifications : [];
  const read = new Set(Array.isArray(readIds) ? readIds : []);
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN;

  return list.filter((notification) => {
    const publishedAt = Date.parse(notification?.published_at);
    if (Number.isNaN(publishedAt)) return false;      // never published — not news
    if (read.has(notification?.id)) return false;     // opened individually
    if (Number.isNaN(seen)) return true;              // never opened, or junk timestamp
    return publishedAt > seen;
  }).length;
}

export function isUnread(notification, lastSeenAt = null, readIds = []) {
  return unreadCount([notification], lastSeenAt, readIds) === 1;
}
