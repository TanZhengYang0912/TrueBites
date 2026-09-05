// AUTH MODULE — Joshua
// Login / register UI backed directly by Supabase Auth (no custom Express routes).

import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useSession } from "../lib/SessionContext";
import { randomDisplayName } from "../lib/randomName";
import PasswordField from "../components/PasswordField";
import TrueBitesLogo from "../components/TrueBitesLogo";
import { isAdmin } from "../lib/roles";
import { logActivity } from "../lib/activityLog";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

// Shared auth vocabulary — also used by the admin login, reset and set-password
// pages so every account screen reflows identically.
export const AUTH_PAGE = "flex min-h-dvh items-center justify-center bg-chalk px-4 py-10 font-body text-ink";
export const AUTH_STACK = "mx-auto flex w-full max-w-[460px] flex-col items-center gap-5";
export const AUTH_CARD = "flex w-full flex-col gap-4 rounded-2xl border border-sand bg-white p-5 shadow-[0_18px_48px_rgba(32,42,53,0.09)] sm:p-8";
export const AUTH_INPUT = "min-h-11 w-full rounded-lg border border-sand bg-white px-3 text-[15px] outline-none focus:border-forest";
export const AUTH_PRIMARY = "min-h-11 w-full rounded-lg bg-forest px-4 text-[15px] font-semibold text-white transition-colors hover:bg-forest-light disabled:opacity-60 motion-reduce:transition-none";
export const AUTH_SECONDARY = "flex min-h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-sand bg-white px-4 text-[15px] font-semibold text-ink transition-colors hover:border-forest motion-reduce:transition-none";
export const AUTH_LINK = "min-h-11 text-center text-[13px] text-forest underline";
export const AUTH_ERROR = "m-0 break-words rounded-lg border border-[#f5c6c0] bg-[#fdecea] px-3 py-2.5 text-[13px] leading-snug text-[#9a2820]";
export const AUTH_INFO = "m-0 break-words rounded-lg border border-[#b9e3c6] bg-[#e9f7ee] px-3 py-2.5 text-[13px] leading-snug text-[#1f6b40]";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

// Only called after a failed password sign-in — never proactively — so it
// can't be used to probe whether an arbitrary email is registered ahead of
// submitting a password.
async function isGoogleOnlyAccount(email) {
  try {
    const response = await fetch(`${API_BASE}/api/login-hint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.googleOnly);
  } catch {
    return false;
  }
}

const TAB = "flex min-h-13 flex-1 items-center justify-center whitespace-nowrap rounded-lg border px-3.5 py-3 text-sm font-semibold transition-colors motion-reduce:transition-none";
const TAB_IDLE = `${TAB} border-sand bg-[#F7F6F3] text-ink hover:border-forest`;
const TAB_ACTIVE = `${TAB} border-forest bg-forest text-white`;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: sessionLoading } = useSession();
  const [searchParams] = useSearchParams();
  // Opens on Log In unless the caller asked for the signup tab. Read once as
  // the initial state — after that the tabs own the mode, so editing the URL
  // by hand mid-session does not yank the form out from under the user.
  const [mode, setMode] = useState(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  ); // "signin" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [justSignedUp, setJustSignedUp] = useState(false);

  // Prefer the page the visitor came from; fall back to /discover when this is
  // the first entry in the router session (a bookmark, a shared link, or a
  // redirect back from Google). React Router stamps that first entry's key
  // "default" — window.history.length would also count other sites visited in
  // the same tab, so going back could leave TrueBites entirely.
  function goBack() {
    if (mode === "forgot") {
      setMode("signin");
      setErrorMsg("");
      setInfoMsg("");
      return;
    }
    if (location.key !== "default") navigate(-1);
    else navigate("/discover");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");
    setLoading(true);

    try {
      const response =
        mode === "signup"
          ? await supabase.auth.signUp({
              email,
              password,
              // Auto display name so reviews have something to show without
              // forcing onboarding (users can change it later in Profile).
              options: { data: { first_name: randomDisplayName() } },
            })
          : await supabase.auth.signInWithPassword({ email, password });

      const { error, data } = response;

      setLoading(false);

      if (error) {
        const errorMessage =
          error?.message ||
          error?.error_description ||
          error?.statusText ||
          error?.status ||
          (error && Object.keys(error).length > 0 ? JSON.stringify(error) : "Unknown error from Supabase");

        if (mode !== "signup" && errorMessage === "Invalid login credentials") {
          const googleOnly = await isGoogleOnlyAccount(email);
          setErrorMsg(
            googleOnly
              ? "The password you entered is incorrect. Try logging in with Google instead."
              : "Sorry, you may have entered a wrong email or password! Try checking again!"
          );
          return;
        }
        setErrorMsg(errorMessage);
        return;
      }

      if (mode === "signup") {
        if (data?.user?.identities?.length === 0) {
          setErrorMsg("This email is already registered. Please sign in instead.");
        } else if (data?.session) {
          // Confirmed immediately (email confirmation off) — collect name/DOB.
          logActivity("auth.signup");
          setJustSignedUp(true);
          navigate("/onboarding", { replace: true });
        } else {
          setInfoMsg("Account created! Check your email — including your spam folder — for a confirmation link, then come back and sign in.");
          setEmail("");
          setPassword("");
        }
      } else {
        // Admin accounts sign in through the admin portal only. This is the
        // mirror of the check in AdminLoginPage.jsx, which signs out any
        // non-admin who authenticates there.
        if (isAdmin({ user: data.user })) {
          await supabase.auth.signOut();
          setErrorMsg("This is an admin account. Please sign in through the admin portal.");
          return;
        }
        logActivity("auth.login");
        navigate("/discover", { replace: true });
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message || "An unexpected error occurred");
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");
    setLoading(true);
    // Always show the same message whether or not the email is registered,
    // so this can't be used to enumerate accounts.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    setInfoMsg("If that email is registered, we've sent a password reset link. Check your inbox and spam folder — the link opens a page to set a new password.");
  }

  async function handleGoogleLogin() {
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/discover` },
    });
    if (error) setErrorMsg(error.message);
  }

  // Signed-in customers go back to the app. Admins never reach this line —
  // AuthGate redirects them to /admin before this page renders.
  // Waits for the session context's initial read (and any Google OAuth code
  // exchange it's resolving) before deciding — otherwise a fast redirect back
  // from Google can render this page as logged-out for a frame.
  if (!sessionLoading && session && !justSignedUp) {
    navigate("/discover", { replace: true });
    return null;
  }

  return (
    <div className={AUTH_PAGE}>
      <div className={AUTH_STACK}>
        <div className="flex w-full items-center">
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="grid size-11 shrink-0 place-items-center rounded-full text-forest hover:bg-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-1 justify-center">
            <TrueBitesLogo />
          </div>
          {/* Balances the arrow so the logo centres without a negative margin —
              an -ml-11 wrapper overlaps the arrow and swallows its clicks. */}
          <div className="size-11 shrink-0" aria-hidden="true" />
        </div>
        <h1 className="m-0 text-center font-display text-[clamp(24px,7vw,32px)] font-bold leading-tight text-ink">
          One step closer for a
          <br />
          <span className="italic text-terracotta">better experience</span>...
        </h1>

        <div className={AUTH_CARD}>
          {mode !== "forgot" && (
            <div className="flex gap-2" role="tablist" aria-label="Account access">
              <button
                className={mode === "signin" ? TAB_ACTIVE : TAB_IDLE}
                role="tab"
                aria-selected={mode === "signin"}
                type="button"
                onClick={() => {
                  setMode("signin");
                  setErrorMsg("");
                  setInfoMsg("");
                }}
              >
                Log In
              </button>
              <button
                className={mode === "signup" ? TAB_ACTIVE : TAB_IDLE}
                role="tab"
                aria-selected={mode === "signup"}
                type="button"
                onClick={() => {
                  setMode("signup");
                  setErrorMsg("");
                  setInfoMsg("");
                }}
              >
                Sign Up
              </button>
            </div>
          )}

          {mode === "forgot" ? (
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
              <p className="m-0 text-[13px] text-muted">
                Enter your account email and we'll send you a link to reset your password.
              </p>
              <input
                className={AUTH_INPUT}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button className={AUTH_PRIMARY} type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                className={AUTH_INPUT}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <PasswordField
                className={AUTH_INPUT}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                className={mode === "signup"
                  ? "min-h-11 w-full rounded-lg bg-terracotta px-4 text-[15px] font-semibold text-white transition-colors hover:bg-terracotta-light disabled:opacity-60 motion-reduce:transition-none"
                  : AUTH_PRIMARY}
                type="submit"
                disabled={loading}
              >
                {loading ? "Please wait…" : mode === "signup" ? "Sign Up" : "Log In"}
              </button>
            </form>
          )}

          {mode === "signin" && (
            <button className={AUTH_LINK} onClick={() => { setMode("forgot"); setErrorMsg(""); setInfoMsg(""); }}>
              Forgot password?
            </button>
          )}
          {errorMsg && <p className={AUTH_ERROR}>{errorMsg}</p>}
          {infoMsg && <p className={AUTH_INFO}>{infoMsg}</p>}

          {mode !== "forgot" && (
            <>
              <div className="text-center text-xs text-muted">— or —</div>
              <button className={AUTH_SECONDARY} onClick={handleGoogleLogin}>
                <GoogleIcon />
                Continue with Google
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
