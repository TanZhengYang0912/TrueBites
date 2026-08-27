import { useEffect, useState } from "react";
import { BookOpen, Store, Users } from "lucide-react";
import AddressAutocomplete from "./AddressAutocomplete";

const INITIAL = {
  suggestion_type: "vendor",
  vendor_name: "", influencer_name: "", source_url: "", location_text: "",
  category: "", signature_dish: "", price_range: "", reason: "", additional_note: "",
  creator_name: "", creator_profile_url: "", creator_sample_video_url: "",
  creator_focus: "", creator_audience: "", creator_social_url: "",
};

const TYPE_OPTIONS = [
  { value: "vendor", label: "A vendor", description: "A place to eat in Melaka", icon: Store },
  { value: "creator", label: "An influencer or channel", description: "A food account worth following", icon: Users },
];

function asValues(input) {
  return { ...INITIAL, ...input, suggestion_type: input?.suggestion_type || "vendor" };
}

function isVideoUrl(value) {
  return /^https?:\/\/(?:www\.|m\.)?(?:tiktok\.com|youtube\.com|youtu\.be)\//i.test(value.trim());
}

function isProfileUrl(value) {
  const match = value.trim().match(/^https?:\/\/([^/]+)(\/.*)?$/i);
  if (!match) return false;
  const host = match[1].toLowerCase();
  const pathname = (match[2] || "").replace(/\/+$/, "");
  if (["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host)) return /^\/@[^/]+$/.test(pathname);
  if (["youtube.com", "www.youtube.com"].includes(host)) return /^\/@[^/]+$/.test(pathname) || /^\/(?:channel|c|user)\/[^/]+$/.test(pathname);
  return false;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validate(values) {
  const errors = {};
  if (values.suggestion_type === "creator") {
    if (values.creator_name.trim().length < 2) errors.creator_name = "Add the creator or channel name.";
    if (!isProfileUrl(values.creator_profile_url)) errors.creator_profile_url = "Use a TikTok or YouTube profile URL.";
    if (values.creator_focus.trim().length < 2) errors.creator_focus = "Tell us what they usually share.";
    if (values.creator_sample_video_url.trim() && !isVideoUrl(values.creator_sample_video_url)) errors.creator_sample_video_url = "Use a TikTok or YouTube video URL.";
    if (values.creator_social_url.trim() && !isHttpUrl(values.creator_social_url)) errors.creator_social_url = "Use an http or https social link.";
  } else {
    if (values.vendor_name.trim().length < 2) errors.vendor_name = "Add the vendor name.";
    if (!isVideoUrl(values.source_url)) errors.source_url = "Use a TikTok or YouTube video URL.";
    if (!/\b(?:malacca|melaka)\b/i.test(values.location_text.trim())) errors.location_text = "This feature is for Malacca/Melaka vendors only.";
  }
  if (values.reason.trim().length < 10) errors.reason = values.suggestion_type === "creator" ? "Tell us why TrueBites should include them." : "Tell us why this place is worth trying.";
  return errors;
}

export default function SuggestionForm({ onSubmit, submitting = false, serverErrors = {}, initialValues }) {
  const [values, setValues] = useState(() => asValues(initialValues));
  const [errors, setErrors] = useState({});
  const type = values.suggestion_type;

  useEffect(() => {
    if (initialValues) setValues(asValues(initialValues));
  }, [initialValues]);

  function update(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function selectType(nextType) {
    setValues((current) => ({ ...current, suggestion_type: nextType }));
    setErrors({});
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSubmit(values);
  }

  const fieldError = (key) => errors[key] || serverErrors[key];
  const inputClass = (key) => `mt-2 min-h-11 w-full rounded-lg border bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-forest focus:ring-2 focus:ring-forest/10 ${fieldError(key) ? "border-red-400" : "border-sand"}`;
  const labelClass = "text-sm font-semibold text-ink";

  return (
    <form onSubmit={handleSubmit} className="grid gap-7" noValidate>
      {initialValues?.status === "needs_info" && initialValues?.admin_note && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong className="mb-1 block font-semibold">Admin requires more information:</strong>
          {initialValues.admin_note}
        </div>
      )}

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-ink">What would you like to suggest?</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {TYPE_OPTIONS.map(({ value, label, description, icon: Icon }) => {
            const active = type === value;
            return (
              <button key={value} type="button" aria-pressed={active} onClick={() => selectType(value)} className={`flex min-h-[76px] items-center gap-3 rounded-xl border p-4 text-left transition-colors transition-transform motion-reduce:transition-none ${active ? "border-forest bg-forest/8 text-forest translate-y-1" : "border-sand bg-white text-ink hover:border-forest/50"}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${active ? "bg-forest text-white" : "bg-sand/45 text-muted"}`}><Icon size={18} /></span>
                <span><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-xs font-normal text-muted">{description}</span></span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {type === "vendor" ? (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <label className={labelClass}>Vendor name <span className="text-terracotta">*</span>
              <input className={inputClass("vendor_name")} value={values.vendor_name} onChange={(event) => update("vendor_name", event.target.value)} placeholder="e.g. Asam Pedas Selera Kampung" maxLength={120} />
              {fieldError("vendor_name") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("vendor_name")}</span>}
            </label>
            <label className={labelClass}>Melaka area or address <span className="text-terracotta">*</span>
              <AddressAutocomplete value={values.location_text} onChange={(value) => update("location_text", value)} error={fieldError("location_text")} />
            </label>
          </div>

          <label className={labelClass}>Source video URL <span className="text-terracotta">*</span>
            <input type="url" className={inputClass("source_url")} value={values.source_url} onChange={(event) => update("source_url", event.target.value)} placeholder="https://www.tiktok.com/@creator/video/..." maxLength={1000} />
            <span className="mt-1 block text-xs font-normal text-muted">A TikTok or YouTube video showing this vendor. An admin reviews it before any AI processing.</span>
            {fieldError("source_url") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("source_url")}</span>}
          </label>

          <label className={labelClass}>Recommended by influencer or channel
            <input className={inputClass("influencer_name")} value={values.influencer_name} onChange={(event) => update("influencer_name", event.target.value)} placeholder="e.g. Melaka Foodie or @melakafoodie" maxLength={120} />
            <span className="mt-1 block text-xs font-normal text-muted">Optional — the person or channel behind the source video.</span>
            {fieldError("influencer_name") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("influencer_name")}</span>}
          </label>

          <div className="grid gap-5 md:grid-cols-3">
            <label className={labelClass}>Cuisine category
              <select className={`${inputClass("category")} appearance-none`} value={values.category} onChange={(event) => update("category", event.target.value)}>
                <option value="">Select category...</option><option value="Malay">Malay</option><option value="Chinese">Chinese</option><option value="Indian">Indian</option><option value="Nyonya">Nyonya</option><option value="Western">Western</option><option value="Cafe">Cafe</option><option value="Dessert">Dessert</option><option value="Fusion">Fusion</option><option value="Other">Other</option>
              </select>
            </label>
            <label className={labelClass}>Signature dish
              <input className={inputClass("signature_dish")} value={values.signature_dish} onChange={(event) => update("signature_dish", event.target.value)} placeholder="e.g. Cendol" maxLength={160} />
            </label>
            <label className={labelClass}>Price range
              <select className={`${inputClass("price_range")} appearance-none`} value={values.price_range} onChange={(event) => update("price_range", event.target.value)}>
                <option value="">Select price...</option><option value="Under RM10">Under RM10</option><option value="RM10 - RM20">RM10 - RM20</option><option value="RM20 - RM40">RM20 - RM40</option><option value="RM40+">RM40+</option>
              </select>
            </label>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <label className={labelClass}>Influencer or channel name <span className="text-terracotta">*</span>
              <input className={inputClass("creator_name")} value={values.creator_name} onChange={(event) => update("creator_name", event.target.value)} placeholder="e.g. Melaka Foodie" maxLength={120} />
              {fieldError("creator_name") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("creator_name")}</span>}
            </label>
            <label className={labelClass}>Profile URL <span className="text-terracotta">*</span>
              <input type="url" className={inputClass("creator_profile_url")} value={values.creator_profile_url} onChange={(event) => update("creator_profile_url", event.target.value)} placeholder="https://www.tiktok.com/@creator" maxLength={1000} />
              {fieldError("creator_profile_url") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("creator_profile_url")}</span>}
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className={labelClass}>What do they usually share? <span className="text-terracotta">*</span>
              <input className={inputClass("creator_focus")} value={values.creator_focus} onChange={(event) => update("creator_focus", event.target.value)} placeholder="e.g. Melaka street food and hidden stalls" maxLength={160} />
              {fieldError("creator_focus") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("creator_focus")}</span>}
            </label>
            <label className={labelClass}>Main area or audience
              <input className={inputClass("creator_audience")} value={values.creator_audience} onChange={(event) => update("creator_audience", event.target.value)} placeholder="e.g. Melaka locals and weekend visitors" maxLength={180} />
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className={labelClass}>Sample video URL
              <input type="url" className={inputClass("creator_sample_video_url")} value={values.creator_sample_video_url} onChange={(event) => update("creator_sample_video_url", event.target.value)} placeholder="Optional TikTok or YouTube video" maxLength={1000} />
              {fieldError("creator_sample_video_url") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("creator_sample_video_url")}</span>}
            </label>
            <label className={labelClass}>Other social link
              <input type="url" className={inputClass("creator_social_url")} value={values.creator_social_url} onChange={(event) => update("creator_social_url", event.target.value)} placeholder="Optional Instagram or website link" maxLength={1000} />
            </label>
          </div>
        </>
      )}

      <label className={labelClass}>{type === "creator" ? "Why should TrueBites include them?" : "Why is it worth trying?"} <span className="text-terracotta">*</span>
        <textarea className={`${inputClass("reason")} min-h-28 resize-y py-3`} value={values.reason} onChange={(event) => update("reason", event.target.value)} placeholder={type === "creator" ? "Tell the TrueBites team what makes this creator useful…" : "Tell the TrueBites team what makes this place special…"} maxLength={1000} />
        {fieldError("reason") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("reason")}</span>}
      </label>

      <label className={labelClass}>Additional note
        <textarea className={`${inputClass("additional_note")} min-h-24 resize-y py-3`} value={values.additional_note} onChange={(event) => update("additional_note", event.target.value)} placeholder={type === "creator" ? "Anything else the admin team should know…" : "Opening hours, a landmark, or anything else…"} maxLength={1000} />
      </label>

      <div className="flex flex-col gap-3 border-t border-sand pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-xl text-xs leading-5 text-muted">By submitting, you allow TrueBites to review the public links and decide whether to publish this recommendation.</p>
        <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-forest px-5 text-sm font-semibold text-white transition-colors hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-60">
          <BookOpen size={15} />{submitting ? "Sending…" : "Send suggestion"}
        </button>
      </div>
    </form>
  );
}
