import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import PasswordField from "../components/PasswordField";
import { AUTH_PAGE, AUTH_STACK, AUTH_CARD, AUTH_INPUT, AUTH_PRIMARY, AUTH_ERROR } from "./LoginPage";
import { logActivity } from "../lib/activityLog";

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function SetAdminPasswordPage() {
  const [session, setSession] = useState(undefined); // undefined = not yet loaded
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading
    if (!session || !session.user?.user_metadata?.must_change_password) {
      navigate("/wsdasabi123&admin-login", { replace: true });
    }
  }, [session, navigate]);

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
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (error) {
      setLoading(false);
      setErrorMsg(error.message);
      return;
    }

    setLoading(false);
    logActivity("auth.password_set");
    navigate("/admin", { replace: true });
  }

  if (!session) return null;

  return (
    <div className={AUTH_PAGE}>
      <div className={AUTH_STACK}>
        <header className="text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sand bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[1.5px] text-terracotta">
            <span>🔑</span> Admin Account
          </div>
          <h1 className="m-0 font-display text-[clamp(24px,7vw,32px)] font-bold leading-tight text-ink">
            Set your password
          </h1>
          <p className="mx-auto mb-0 mt-2 max-w-[380px] text-sm text-muted">
            Your admin account has been created. Set a new password to continue.
          </p>
        </header>

        <div className={AUTH_CARD}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <PasswordField
              className={AUTH_INPUT}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <PasswordField
              className={AUTH_INPUT}
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <button className={AUTH_PRIMARY} type="submit" disabled={loading}>
              {loading ? "Saving…" : "Set password & continue"}
            </button>
          </form>
          {errorMsg && <p className={AUTH_ERROR}>{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}
