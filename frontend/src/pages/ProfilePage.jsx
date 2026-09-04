import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useSession } from "../lib/SessionContext";
import { deleteAccount, uploadAvatar } from "../api";
import DobScrollPicker from "../components/DobScrollPicker";
import { customerSession } from "../lib/roles";
import { logActivity } from "../lib/activityLog";
import { AUTH_INPUT, AUTH_ERROR } from "./LoginPage";
import Footer from "../components/Footer";
import { COUNTRY_CODES, DEFAULT_COUNTRY, splitStoredPhone } from "../lib/countryCodes";

// Profile action buttons — full width on every screen, 44px minimum height.
const ACTION_OUTLINE = "min-h-11 w-full rounded-full border-[1.5px] border-forest bg-forest px-4 text-sm font-medium text-white";
const ACTION_MUTED = "min-h-11 w-full rounded-full border border-sand bg-white px-4 text-sm font-medium text-forest";
const ACTION_LOGOUT = "min-h-11 w-full rounded-full border border-[#D64545] bg-[#D64545] px-4 text-sm font-medium text-white";
const ACTION_DANGER = "min-h-11 w-full rounded-full border-[1.5px] border-[#111111] bg-[#111111] px-4 text-[13.5px] font-medium text-white";
const ROW_CANCEL = "min-h-11 flex-1 rounded-full border border-sand bg-white px-4 text-[13.5px] font-medium text-ink";
const ROW_CONFIRM = "min-h-11 flex-1 rounded-full bg-forest px-4 text-[13.5px] font-semibold text-white";

function parseDob(iso) {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { day, month, year };
}
function formatDob({ day, month, year }) {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

const GENDER_OPTIONS = ["Male", "Female", "Prefer not to say"];
const NAME_MAX_LENGTH = 30;
const PHONE_DIGITS_MAX = 10;
const PHONE_DIGITS_MIN = 7;

export default function ProfilePage() {
  const { session: authSession, loading } = useSession();
  const session = customerSession(authSession);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState(null);
  const [gender, setGender] = useState("");
  const [phoneDial, setPhoneDial] = useState(DEFAULT_COUNTRY.dial);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-chalk text-muted">
        <div>Loading...</div>
      </div>
    );
  }

  if (!session && !loggingOut && !deleting) {
    navigate("/login", { replace: true });
    return null;
  }

  const meta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = meta.avatar_url || "";
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ");
  const savedDob = parseDob(meta.date_of_birth);
  const initials = fullName
    ? (meta.first_name?.[0] || "") + (meta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");
  // Google-only accounts have no password to reset — only accounts with an
  // "email" identity (signed up or linked via email/password) get the option.
  const hasPassword = (session?.user?.identities || []).some((i) => i.provider === "email");

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    navigate("/map", { replace: true });
  };

  function startEditing() {
    setFirstName(meta.first_name || "");
    setLastName(meta.last_name || "");
    setDob(savedDob || { day: 1, month: 1, year: new Date().getFullYear() - 18 });
    setGender(meta.gender || "");
    const { dial, digits } = splitStoredPhone(meta.phone);
    setPhoneDial(dial);
    setPhoneDigits(digits);
    setErrorMsg("");
    setEditing(true);
  }

  // Local numbers are usually typed with a leading trunk "0" ("0123456789")
  // that isn't part of the number once a country code is prefixed — stripped
  // as they type rather than left for them to notice and delete themselves.
  // Capped at PHONE_DIGITS_MAX so typing simply stops accepting more digits.
  function handlePhoneDigitsChange(raw) {
    let digits = raw.replace(/\D/g, "");
    if (digits.startsWith("0")) digits = digits.slice(1);
    setPhoneDigits(digits.slice(0, PHONE_DIGITS_MAX));
  }

  // phoneDigits itself stays plain digits (that's what gets saved/validated/
  // counted) — this only affects what's shown in the input. The space is
  // reconstructed from the raw digits on every render, so it survives
  // whatever position the user is typing/deleting from.
  function formatPhoneDisplay(digits) {
    return digits.length > 2 ? `${digits.slice(0, 2)} ${digits.slice(2)}` : digits;
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image must be under 5MB.");
      return;
    }

    setUploadingAvatar(true);
    setErrorMsg("");
    try {
      // Routed through the backend (three-tier) — the server validates and
      // writes to Storage; the browser never touches the data tier directly.
      await uploadAvatar(session.access_token, file);
      // Refresh the session so the new avatar_url in user_metadata shows up —
      // the shared SessionContext listener picks up the resulting
      // TOKEN_REFRESHED event automatically.
      await supabase.auth.refreshSession();
    } catch (err) {
      setErrorMsg(err.message || "Failed to upload photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount(session.access_token);
      await supabase.auth.signOut();
      navigate("/map", { replace: true });
    } catch (err) {
      setDeleteError(err.message || "Failed to delete account.");
      setDeleting(false);
    }
  }

  async function handleSave() {
    const first = firstName.trim();
    const last = lastName.trim();

    if (!first || !last) {
      setErrorMsg("First and last name are required.");
      return;
    }
    if (first.length > NAME_MAX_LENGTH) {
      setErrorMsg(`First name must be ${NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (last.length > NAME_MAX_LENGTH) {
      setErrorMsg(`Last name must be ${NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }

    // Semantic: names must be letters only (allows spaces, hyphens, apostrophes for names like O'Brien, Al-Rashid)
    const namePattern = /^[a-zA-Z\s'\-.]+$/;
    if (!namePattern.test(first)) {
      setErrorMsg("First name must contain only letters.");
      return;
    }
    if (!namePattern.test(last)) {
      setErrorMsg("Last name must contain only letters.");
      return;
    }

    // The max length is already enforced live as they type (handlePhoneDigitsChange
    // caps it at PHONE_DIGITS_MAX) — this just catches an implausibly short number.
    if (phoneDigits && phoneDigits.length < PHONE_DIGITS_MIN) {
      setErrorMsg(`Phone number must be at least ${PHONE_DIGITS_MIN} digits.`);
      return;
    }
    const phoneCombined = phoneDigits ? `${phoneDial}${phoneDigits}` : "";

    // Semantic: validate DOB is a real calendar date
    const dobDate = new Date(dob.year, dob.month - 1, dob.day);
    if (
      dobDate.getFullYear() !== dob.year ||
      dobDate.getMonth() + 1 !== dob.month ||
      dobDate.getDate() !== dob.day
    ) {
      setErrorMsg("Please enter a valid date of birth.");
      return;
    }

    const today = new Date();
    if (dobDate >= today) {
      setErrorMsg("Date of birth cannot be in the future.");
      return;
    }

    let age = today.getFullYear() - dob.year;
    if (
      today.getMonth() + 1 < dob.month ||
      (today.getMonth() + 1 === dob.month && today.getDate() < dob.day)
    ) age--;
    if (age < 13) {
      setErrorMsg("You must be at least 13 years old to use this app.");
      return;
    }
    if (age > 120) {
      setErrorMsg("Please enter a valid date of birth.");
      return;
    }

    if (!gender) {
      setErrorMsg("Please select a gender.");
      return;
    }

    const dobIso = `${dob.year}-${String(dob.month).padStart(2, "0")}-${String(dob.day).padStart(2, "0")}`;

    // Idempotency: skip API call if nothing actually changed
    if (
      first === (meta.first_name || "") &&
      last === (meta.last_name || "") &&
      dobIso === (meta.date_of_birth || "") &&
      gender === (meta.gender || "") &&
      phoneCombined === (meta.phone || "")
    ) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setErrorMsg("");
    const { error } = await supabase.auth.updateUser({
      data: { first_name: first, last_name: last, date_of_birth: dobIso, gender, phone: phoneCombined },
    });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    // The shared SessionContext listener picks up the resulting USER_UPDATED
    // event automatically — no need to re-fetch the session here.
    logActivity("profile.update");
    setEditing(false);
  }

  function startResettingPassword() {
    setResetError("");
    setResetDone(false);
    setResettingPassword(true);
  }

  async function handleResetPassword() {
    setResetSaving(true);
    setResetError("");
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/reset-password?redirect=profile`,
    });
    setResetSaving(false);
    if (error) { setResetError(error.message); return; }
    setResetDone(true);
  }

  return (
    <>
      <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-chalk px-4 py-8 font-body text-ink sm:py-10">
      <div className="relative mx-auto w-full max-w-[560px] rounded-2xl border border-sand bg-white p-5 text-left shadow-[0_18px_48px_rgba(32,42,53,0.09)] sm:p-8">
        <div className="mb-7 flex items-center justify-between">
          <button onClick={() => navigate("/map")} className="grid size-11 place-items-center text-xl text-forest">
            ←
          </button>
          <h2 className="m-0 text-xl font-bold text-ink">My Profile</h2>
          <div className="size-11" />
        </div>

        <div className="relative mx-auto mb-7 w-18">
          <div className="flex size-18 items-center justify-center overflow-hidden rounded-full bg-forest text-2xl font-semibold text-white">
            {avatarUrl
              ? <img src={avatarUrl} alt="Profile" className="size-full object-cover" />
              : initials}
          </div>

          {editing && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="Change photo"
                aria-label="Change photo"
                className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-forest text-white disabled:opacity-60"
              >
                <Camera size={13} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </>
          )}
        </div>
        {editing && uploadingAvatar && (
          <div className="-mt-4 mb-4 text-xs text-muted">Uploading…</div>
        )}

        {!editing ? (
          <>
            <div className="mb-4">
              <div className="mb-2 text-sm text-muted">Email</div>
              <div className="break-words text-base font-medium text-ink">{userEmail}</div>
            </div>

            <div className="mb-4">
              <div className="mb-2 text-sm text-muted">Full Name</div>
              <div className="break-words text-base font-medium text-ink">{fullName || "Not set"}</div>
            </div>

            <div className="mb-4">
              <div className="mb-2 text-sm text-muted">Date of Birth</div>
              <div className="text-base font-medium text-ink">{savedDob ? formatDob(savedDob) : "Not set"}</div>
            </div>

            <div className="mb-4">
              <div className="mb-2 text-sm text-muted">Gender</div>
              <div className="text-base font-medium text-ink">{meta.gender || "Not set"}</div>
            </div>

            <div className="mb-7">
              <div className="mb-2 text-sm text-muted">Phone Number</div>
              <div className="text-base font-medium text-ink">
                {meta.phone ? (() => {
                  const { dial, digits } = splitStoredPhone(meta.phone);
                  return `${dial} ${formatPhoneDisplay(digits)}`;
                })() : "Not set"}
              </div>
            </div>

            <button onClick={startEditing} className={`mb-2.5 ${ACTION_OUTLINE}`}>
              Edit Profile
            </button>

            {hasPassword && (
              <button onClick={startResettingPassword} className={`mb-2.5 ${ACTION_MUTED}`}>
                Reset Password
              </button>
            )}

            {resettingPassword && (
              <div className="mb-2.5 rounded-lg border border-sand bg-chalk p-3.5 text-left">
                {resetDone ? (
                  <>
                    <p className="mb-3 mt-0 text-[13px] text-ink">Your password has been updated.</p>
                    <button onClick={() => setResettingPassword(false)} className={ROW_CONFIRM + " w-full"}>
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mb-3 mt-0 text-[13px] leading-normal text-ink">
                      We’ll email you a secure link to choose a new password.
                    </p>
                    {resetError && <p className={`mb-3 ${AUTH_ERROR}`}>{resetError}</p>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <button onClick={() => setResettingPassword(false)} disabled={resetSaving} className={ROW_CANCEL}>
                        Cancel
                      </button>
                      <button onClick={handleResetPassword} disabled={resetSaving} className={ROW_CONFIRM}>
                        {resetSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button onClick={handleLogout} className={`mb-6 ${ACTION_LOGOUT}`}>
              Log out
            </button>

            <div className="border-t border-sand pt-5 text-left">
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.4px] text-muted">
                Danger Zone
              </div>

              {!confirmingDelete ? (
                <button
                  onClick={() => { setConfirmingDelete(true); setDeleteError(""); }}
                  className={ACTION_DANGER}
                >
                  Delete Account Permanently
                </button>
              ) : (
                <div className="rounded-lg border border-[#F3B8B3] bg-[#FDEDEC] p-3.5">
                  <p className="mb-3 mt-0 text-[13px] leading-snug text-[#8C2E24]">
                    This permanently deletes your account and all its data from Supabase.
                    This cannot be undone.
                  </p>
                  {deleteError && <p className={`mb-2.5 ${AUTH_ERROR}`}>{deleteError}</p>}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <button onClick={() => setConfirmingDelete(false)} disabled={deleting} className={ROW_CANCEL}>
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="min-h-11 flex-1 rounded-md bg-[#D64545] px-4 text-[13.5px] font-semibold text-white"
                    >
                      {deleting ? "Deleting…" : "Yes, Delete Forever"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2.5 text-left">
              <label className="text-[13px] text-muted">
                First name
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={NAME_MAX_LENGTH}
                  className={`mt-1 ${AUTH_INPUT}`}
                />
                <div className={`mt-1 text-right text-[11px] ${firstName.length >= NAME_MAX_LENGTH ? "text-[#D64545]" : "text-muted"}`}>
                  {firstName.length}/{NAME_MAX_LENGTH} characters
                </div>
              </label>
              <label className="text-[13px] text-muted">
                Last name
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={NAME_MAX_LENGTH}
                  className={`mt-1 ${AUTH_INPUT}`}
                />
                <div className={`mt-1 text-right text-[11px] ${lastName.length >= NAME_MAX_LENGTH ? "text-[#D64545]" : "text-muted"}`}>
                  {lastName.length}/{NAME_MAX_LENGTH} characters
                </div>
              </label>

              <label className="mt-1.5 text-[13px] text-muted">
                Phone number
                <div className="mt-1 flex items-stretch gap-1.5">
                  <select
                    value={phoneDial}
                    onChange={(e) => setPhoneDial(e.target.value)}
                    aria-label="Country code"
                    style={{ width: 96, flex: "0 0 auto" }}
                    className={`${AUTH_INPUT} !w-auto`}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.dial}>{c.flag} {c.dial}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={formatPhoneDisplay(phoneDigits)}
                    onChange={(e) => handlePhoneDigitsChange(e.target.value)}
                    placeholder="12 3456789"
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    className={AUTH_INPUT}
                  />
                </div>
                <div className="mt-1 text-right text-[11px] text-muted">
                  {phoneDigits.length}/{PHONE_DIGITS_MAX} digits
                </div>
              </label>

              <div className="mt-1.5 text-[13px] text-muted">Date of birth</div>
              <div className="grid grid-cols-3 place-items-center gap-1 text-[10.5px] font-semibold text-muted">
                <span>DAY</span>
                <span>MONTH</span>
                <span>YEAR</span>
              </div>
              <DobScrollPicker value={dob} onChange={setDob} />

              <label className="mt-1.5 text-[13px] text-muted">
                Gender
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={`mt-1 ${AUTH_INPUT}`}
                >
                  <option value="" disabled>Select gender</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            {errorMsg && <p className={`mb-3 ${AUTH_ERROR}`}>{errorMsg}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button onClick={() => setEditing(false)} disabled={saving} className={ROW_CANCEL}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className={ROW_CONFIRM}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
      <Footer />
    </>
  );
}
