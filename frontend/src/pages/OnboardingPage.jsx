import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useSession } from "../lib/SessionContext";
import DobScrollPicker from "../components/DobScrollPicker";
import { AUTH_INPUT, AUTH_PRIMARY, AUTH_ERROR } from "./LoginPage";

const STEPS = ["Full Name", "Date of Birth", "Gender"];
const CURRENT_YEAR = new Date().getFullYear();
const GENDER_OPTIONS = ["Male", "Female", "Prefer not to say"];

const BACK_BUTTON = "min-h-11 rounded-lg border border-sand bg-white px-4 text-sm font-semibold text-forest";

function parseDobIso(iso) {
  if (!iso) return null;
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) return null;
  return { day, month, year };
}

// Forced 3-step onboarding right after email/password signup — collects the
// account's first/last name, DOB, and gender before the user can reach the app.
export default function OnboardingPage() {
  const { session, loading: checking } = useSession();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState({ day: 1, month: 1, year: CURRENT_YEAR - 18 });
  const [gender, setGender] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const prefilled = useRef(false);

  useEffect(() => {
    if (checking) return;
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }
    // Prefill anything already on the account (name is auto-assigned, DOB and
    // gender are optional and may be blank). Onboarding is never forced now —
    // this page is a place to complete a profile, with a Skip option. Guarded
    // to run once — a later session refresh shouldn't clobber in-progress edits.
    if (prefilled.current) return;
    prefilled.current = true;
    const meta = session.user.user_metadata || {};
    if (meta.first_name) setFirstName(meta.first_name);
    if (meta.last_name) setLastName(meta.last_name);
    if (meta.gender) setGender(meta.gender);
    const parsed = parseDobIso(meta.date_of_birth);
    if (parsed) setDob(parsed);
  }, [checking, session, navigate]);

  if (checking) return null;

  const namePattern = /^[a-zA-Z\s'\-.]+$/;
  const canContinueStep0 = firstName.trim().length > 0 && lastName.trim().length > 0;

  function handleContinue() {
    const first = firstName.trim();
    const last = lastName.trim();
    if (first.length > 50) { setErrorMsg("First name must be 50 characters or fewer."); return; }
    if (last.length > 50) { setErrorMsg("Last name must be 50 characters or fewer."); return; }
    if (!namePattern.test(first)) { setErrorMsg("First name must contain only letters."); return; }
    if (!namePattern.test(last)) { setErrorMsg("Last name must contain only letters."); return; }
    setErrorMsg("");
    setStep(1);
  }

  function handleContinueStep1() {
    // Semantic: validate DOB is a real calendar date
    const dobDate = new Date(dob.year, dob.month - 1, dob.day);
    if (
      dobDate.getFullYear() !== dob.year ||
      dobDate.getMonth() + 1 !== dob.month ||
      dobDate.getDate() !== dob.day
    ) { setErrorMsg("Please enter a valid date of birth."); return; }

    const today = new Date();
    if (dobDate >= today) { setErrorMsg("Date of birth cannot be in the future."); return; }

    let age = today.getFullYear() - dob.year;
    if (today.getMonth() + 1 < dob.month || (today.getMonth() + 1 === dob.month && today.getDate() < dob.day)) age--;
    if (age < 13) { setErrorMsg("You must be at least 13 years old to use this app."); return; }
    if (age > 120) { setErrorMsg("Please enter a valid date of birth."); return; }

    setErrorMsg("");
    setStep(2);
  }

  // Gender is optional — save whatever's been filled in.
  async function finish() {
    setSaving(true);
    setErrorMsg("");
    const dobIso = `${dob.year}-${String(dob.month).padStart(2, "0")}-${String(dob.day).padStart(2, "0")}`;
    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dobIso,
        gender: gender || null,
      },
    });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    navigate("/map", { replace: true });
  }

  // Onboarding is optional — leave without saving anything.
  function skip() {
    navigate("/map", { replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-chalk px-4 py-6 font-body text-ink sm:py-10">
      <div className="mx-auto w-full max-w-[380px] rounded-2xl border border-sand bg-white p-5 shadow-[0_20px_60px_rgba(64,84,74,0.2)] sm:p-8">
        {/* Step progression line */}
        <div className="mb-7 flex items-center">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={i < STEPS.length - 1 ? "flex flex-1 items-center" : "flex flex-none items-center"}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={i <= step
                    ? "flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-forest bg-forest text-[12.5px] font-bold text-white"
                    : "flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-sand bg-chalk text-[12.5px] font-bold text-muted"}
                >
                  {i + 1}
                </div>
                <span
                  className={i === step
                    ? "whitespace-nowrap text-[10.5px] font-semibold text-forest"
                    : "whitespace-nowrap text-[10.5px] text-muted"}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={i < step ? "mx-2 mb-4.5 h-0.5 min-w-3 flex-1 bg-forest" : "mx-2 mb-4.5 h-0.5 min-w-3 flex-1 bg-sand"} />
              )}
            </div>
          ))}
        </div>

        <h2 className="mb-1 mt-0 font-display text-xl text-forest">
          {step === 0 ? "What's your name?" : step === 1 ? "When were you born?" : "What's your gender?"}
        </h2>
        <p className="mb-5 mt-0 text-[13px] text-muted">
          {step === 0
            ? "Let's personalize your TrueBites experience."
            : "Used to tailor recommendations — kept private."}
        </p>

        {step === 0 && (
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              placeholder="First name"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setErrorMsg(""); }}
              maxLength={50}
              className={AUTH_INPUT}
            />
            <input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setErrorMsg(""); }}
              maxLength={50}
              className={AUTH_INPUT}
            />
            {errorMsg && <p className={AUTH_ERROR}>{errorMsg}</p>}
            <button
              onClick={handleContinue}
              disabled={!canContinueStep0}
              className={canContinueStep0
                ? `mt-2 ${AUTH_PRIMARY}`
                : "mt-2 min-h-11 w-full rounded-lg bg-sand px-4 text-[15px] font-semibold text-white"}
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 place-items-center gap-1 text-[11px] font-semibold text-muted">
              <span>DAY</span>
              <span>MONTH</span>
              <span>YEAR</span>
            </div>
            <DobScrollPicker value={dob} onChange={setDob} />

            {errorMsg && <p className={AUTH_ERROR}>{errorMsg}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button onClick={() => setStep(0)} className={`flex-1 ${BACK_BUTTON}`}>
                Back
              </button>
              <button onClick={handleContinueStep1} className={`flex-1 ${AUTH_PRIMARY}`}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => { setGender(option); setErrorMsg(""); }}
                  className={gender === option
                    ? "min-h-11 rounded-lg border-[1.5px] border-forest bg-forest px-3.5 text-left text-sm font-semibold text-white"
                    : "min-h-11 rounded-lg border-[1.5px] border-sand bg-white px-3.5 text-left text-sm text-forest"}
                >
                  {option}
                </button>
              ))}
            </div>

            {errorMsg && <p className={AUTH_ERROR}>{errorMsg}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button onClick={() => setStep(1)} className={`flex-1 ${BACK_BUTTON}`}>
                Back
              </button>
              <button onClick={finish} disabled={saving} className={`flex-1 ${AUTH_PRIMARY}`}>
                {saving ? "Saving…" : "Finish"}
              </button>
            </div>
          </div>
        )}

        {/* Onboarding is optional — you can always complete it later in Profile. */}
        <button
          onClick={skip}
          className="mx-auto mt-4 block min-h-11 text-[13px] text-muted underline"
        >
          Skip for now — you can add these later in your profile
        </button>
      </div>
    </div>
  );
}
