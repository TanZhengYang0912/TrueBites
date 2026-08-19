import { useState } from "react";

const INITIAL = {
  vendor_name: "",
  source_url: "",
  location_text: "",
  category: "",
  signature_dish: "",
  price_range: "",
  reason: "",
  additional_note: "",
};

function validate(values) {
  const errors = {};
  if (values.vendor_name.trim().length < 2) errors.vendor_name = "Add the vendor name.";
  if (!/^https?:\/\/(?:www\.|m\.)?(?:tiktok\.com|youtube\.com|youtu\.be)\//i.test(values.source_url.trim())) {
    errors.source_url = "Use a TikTok or YouTube video URL.";
  }
  if (!/\b(?:malacca|melaka)\b/i.test(values.location_text.trim())) {
    errors.location_text = "This feature is for Malacca/Melaka vendors only.";
  }
  if (values.reason.trim().length < 10) errors.reason = "Tell us why this place is worth trying.";
  return errors;
}

export default function SuggestionForm({ onSubmit, submitting = false, serverErrors = {}, initialValues }) {
  const [values, setValues] = useState(initialValues || INITIAL);
  const [errors, setErrors] = useState({});

  function update(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSubmit(values);
  }

  const fieldError = (key) => errors[key] || serverErrors[key];
  const inputClass = (key) => `mt-2 min-h-11 w-full rounded border bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-forest focus:ring-2 focus:ring-forest/10 ${fieldError(key) ? "border-red-400" : "border-sand"}`;

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      {initialValues?.status === "needs_info" && initialValues?.admin_note && (
        <div className="rounded bg-amber-50 p-4 text-sm text-amber-800 border border-amber-200">
          <strong className="font-semibold block mb-1">Admin requires more information:</strong>
          {initialValues.admin_note}
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm font-semibold text-ink">
          Vendor name <span className="text-terracotta">*</span>
          <input className={inputClass("vendor_name")} value={values.vendor_name} onChange={(event) => update("vendor_name", event.target.value)} placeholder="e.g. Asam Pedas Selera Kampung" maxLength={120} />
          {fieldError("vendor_name") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("vendor_name")}</span>}
        </label>
        <label className="text-sm font-semibold text-ink">
          Malacca area or address <span className="text-terracotta">*</span>
          <input list="malacca-areas" className={inputClass("location_text")} value={values.location_text} onChange={(event) => update("location_text", event.target.value)} placeholder="e.g. Jonker Street, Melaka" maxLength={180} />
          <datalist id="malacca-areas">
            <option value="Jonker Street, Melaka" />
            <option value="Melaka Raya, Melaka" />
            <option value="Klebang, Melaka" />
            <option value="Ayer Keroh, Melaka" />
            <option value="Kota Laksamana, Melaka" />
            <option value="Alor Gajah, Melaka" />
            <option value="Jasin, Melaka" />
            <option value="Bukit Beruang, Melaka" />
            <option value="Ujong Pasir, Melaka" />
            <option value="Tengkera, Melaka" />
          </datalist>
          {fieldError("location_text") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("location_text")}</span>}
        </label>
      </div>

      <label className="text-sm font-semibold text-ink">
        TikTok or YouTube video URL <span className="text-terracotta">*</span>
        <input type="url" className={inputClass("source_url")} value={values.source_url} onChange={(event) => update("source_url", event.target.value)} placeholder="https://www.tiktok.com/@creator/video/..." maxLength={1000} />
        <span className="mt-1 block text-xs font-normal text-muted">Share a video about this vendor. Our admin team will review it before any AI processing.</span>
        {fieldError("source_url") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("source_url")}</span>}
      </label>

      <div className="grid gap-5 md:grid-cols-3">
        <label className="text-sm font-semibold text-ink">
          Cuisine category
          <select className={`${inputClass("category")} appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_12px_center] bg-no-repeat pr-8`} value={values.category} onChange={(event) => update("category", event.target.value)}>
            <option value="">Select category...</option>
            <option value="Malay">Malay</option>
            <option value="Chinese">Chinese</option>
            <option value="Indian">Indian</option>
            <option value="Nyonya">Nyonya</option>
            <option value="Western">Western</option>
            <option value="Cafe">Cafe</option>
            <option value="Dessert">Dessert</option>
            <option value="Fusion">Fusion</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-ink">
          Signature dish
          <input className={inputClass("signature_dish")} value={values.signature_dish} onChange={(event) => update("signature_dish", event.target.value)} placeholder="e.g. Cendol" maxLength={160} />
          <span className="mt-1 block text-xs font-normal text-muted">e.g. Asam Pedas, Cendol, Chicken Rice Balls</span>
        </label>
        <label className="text-sm font-semibold text-ink">
          Price range
          <select className={`${inputClass("price_range")} appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_12px_center] bg-no-repeat pr-8`} value={values.price_range} onChange={(event) => update("price_range", event.target.value)}>
            <option value="">Select price...</option>
            <option value="Under RM10">Under RM10</option>
            <option value="RM10 - RM20">RM10 - RM20</option>
            <option value="RM20 - RM40">RM20 - RM40</option>
            <option value="RM40+">RM40+</option>
          </select>
        </label>
      </div>

      <label className="text-sm font-semibold text-ink">
        Why is it worth trying? <span className="text-terracotta">*</span>
        <textarea className={`${inputClass("reason")} min-h-28 resize-y py-3`} value={values.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Tell the TrueBites team what makes this place special…" maxLength={1000} />
        {fieldError("reason") && <span className="mt-1 block text-xs font-normal text-red-600">{fieldError("reason")}</span>}
      </label>

      <label className="text-sm font-semibold text-ink">
        Additional note
        <textarea className={`${inputClass("additional_note")} min-h-24 resize-y py-3`} value={values.additional_note} onChange={(event) => update("additional_note", event.target.value)} placeholder="Opening hours, a useful landmark, or anything else…" maxLength={1000} />
      </label>

      <div className="flex flex-col gap-3 border-t border-sand pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-xl text-xs leading-5 text-muted">By submitting, you allow TrueBites to review this public video and verify the vendor before publishing.</p>
        <button type="submit" disabled={submitting} className="min-h-11 rounded bg-forest px-5 text-sm font-semibold text-white transition-colors hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? "Sending…" : "Send suggestion"}
        </button>
      </div>
    </form>
  );
}
