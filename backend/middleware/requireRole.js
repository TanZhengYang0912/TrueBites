import { supabase } from "../supabase.js";

// Local-testing escape hatch: set DISABLE_AUTH=true in backend/.env to skip
// token/role verification. Unset (the default) = real authorization enforced.
const AUTH_DISABLED = process.env.DISABLE_AUTH === "true";

// Verifies the caller's Supabase access token and checks their app_metadata.role
// against an allow-list. Attaches the resolved user to req.callerUser on success.
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (AUTH_DISABLED) {
      req.callerUser = { id: "dev", app_metadata: { role: "admin" } };
      return next();
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing access token" });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    if (!allowedRoles.includes(data.user.app_metadata?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.callerUser = data.user;
    next();
  };
}
