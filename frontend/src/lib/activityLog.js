import { supabase } from "../supabaseClient";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

// Fire-and-forget activity logging for actions that happen entirely via
// supabase-js on the client (login, signup, password changes) — there's no
// other backend request in the path to attach a log call to. Never blocks
// or throws into the caller; a failed log must never break the real action
// it's describing.
export async function logActivity(action, metadata) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch(`${BASE}/api/auth/log-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, metadata }),
    });
  } catch {
    // best-effort only
  }
}
