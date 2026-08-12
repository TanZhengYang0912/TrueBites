import { hasPermission, ACCESS_DENIED_MESSAGE } from "../lib/permissions.js";

// Must run after requireRole, which attaches req.callerUser. Blocks the
// underlying API too — the frontend greys out the tab and shows this same
// message, but that's a UI convenience, not the security boundary.
export function requirePermission(key) {
  return (req, res, next) => {
    if (!hasPermission(req.callerUser, key)) {
      return res.status(403).json({ error: ACCESS_DENIED_MESSAGE });
    }
    next();
  };
}
