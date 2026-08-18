import { supabase } from "../supabase.js";

const AUTH_DISABLED = process.env.DISABLE_AUTH === "true";

const TEST_USER = {
  id: "78c8682a-102e-4925-a2c1-71144f4aaace",
  email: "customer-test@truebites.local",
  app_metadata: {},
  user_metadata: { first_name: "Test", last_name: "Customer" },
};

// Customer routes use the same verified-token boundary as account and
// engagement routes. The request body never controls the caller identity.
export function requireUser(req, res, next) {
  if (AUTH_DISABLED) {
    req.callerUser = TEST_USER;
    return next();
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required" });

  supabase.auth.getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      req.callerUser = data.user;
      return next();
    })
    .catch((error) => {
      console.error("requireUser failed:", error.message);
      return res.status(401).json({ error: "Invalid or expired session" });
    });
}

