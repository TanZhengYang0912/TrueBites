import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import PasswordField from "../components/PasswordField";
import TrueBitesLogo from "../components/TrueBitesLogo";
import { AUTH_PAGE, AUTH_STACK, AUTH_CARD, AUTH_INPUT, AUTH_PRIMARY, AUTH_ERROR } from "./LoginPage";
import { logActivity } from "../lib/activityLog";
import { isAdmin } from "../lib/roles";

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

// Landed on via the "reset password" link emailed by resetPasswordForEmail().
// supabase-js reads the recovery token out of the URL and turns it into a
// real session automatically — we just wait for that before showing the form.
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const fromProfile = new URLSearchParams(window.location.search).get("redirect") === "profile";

  useEffect(() => {
    let settled = false;

    // Admin passwords are set only with backend/scripts/setAdminPassword.js.
    // A recovery link must not let an admin set their own password, and must
    // not become a passwordless way into the console — so an admin session
    // arriving here is signed straight back out.
    const accept = (session) => {
      settled = true;
      if (isAdmin(session)) {
        supabase.auth.signOut();
        setBlocked(true);
        return;
      }
      setReady(true);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) accept(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) accept(session);
    });
    // If no recovery session materialises, the link was invalid or expired.
    const timer = setTimeout(() => { if (!settled) setLinkInvalid(true); }, 4000);
    return () => { clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!PASSWORD_RE.test(password)) {
      setErrorMsg("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setErrorMsg(error.message); return; }
    logActivity("auth.password_reset");
    setDone(true);
    if (fromProfile) setTimeout(() => navigate("/profile", { replace: true }), 1500);
  }

  if (blocked) {
    return (
      <div className={AUTH_PAGE}>
        <div className="w-full max-w-[420px] rounded-2xl border border-sand bg-white p-5 text-center shadow-[0_18px_48px_rgba(32,42,53,0.09)] sm:p-8">
          <h2 className="mb-2 mt-0 font-display text-[22px] text-ink">Password reset unavailable</h2>
          <p className="mb-5 mt-0 text-[13.5px] text-muted">
            Admin passwords cannot be reset from the website. Contact whoever holds the
            project&rsquo;s Supabase service key to have yours changed.
          </p>
          <button className={AUTH_PRIMARY} onClick={() => navigate("/", { replace: true })}>
            Return to home
          </button>
        </div>
      </div>
    );
  }

  if (linkInvalid) {
    return (
      <div className={AUTH_PAGE}>
        <div className="w-full max-w-[420px] rounded-2xl border border-sand bg-white p-5 text-center shadow-[0_18px_48px_rgba(32,42,53,0.09)] sm:p-8">
          <h2 className="mb-2 mt-0 font-display text-[22px] text-ink">Reset link invalid or expired</h2>
          <p className="mb-5 mt-0 text-[13.5px] text-muted">
            This password reset link is no longer valid. Reset links expire after a while — please request a new one.
          </p>
          <button className={AUTH_PRIMARY} onClick={() => navigate("/login", { replace: true })}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={AUTH_PAGE}>
        <div className="text-sm text-muted">Verifying your reset link…</div>
      </div>
    );
  }

  return (
    <div className={AUTH_PAGE}>
      <div className={AUTH_STACK}>
        <Link to="/" aria-label="Back to TrueBites home">
          <TrueBitesLogo />
        </Link>
        <div className={AUTH_CARD}>
          <h2 className="m-0 font-display text-2xl text-ink">
            {done ? "Password reset" : "Set a new password"}
          </h2>

          {done ? (
            <>
              <p className="m-0 text-[13.5px] text-muted">
                {fromProfile
                  ? "Your password has been updated. Taking you back to your profile…"
                  : "Your password has been updated. You can now sign in with it."}
              </p>
              <button
                className={AUTH_PRIMARY}
                onClick={() => navigate(fromProfile ? "/profile" : "/login", { replace: true })}
              >
                {fromProfile ? "Back to Profile" : "Go to Sign In"}
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <PasswordField
                className={AUTH_INPUT}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <PasswordField
                className={AUTH_INPUT}
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {errorMsg && <p className={AUTH_ERROR}>{errorMsg}</p>}
              <button className={AUTH_PRIMARY} type="submit" disabled={loading}>
                {loading ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
