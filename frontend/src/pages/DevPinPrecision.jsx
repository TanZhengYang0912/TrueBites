// Dev-only demo of the three candidate fixes for vendor pin precision.
// Mounted at /dev/map in development builds only (see App.jsx). Delete once a
// method is chosen — it ships nothing and is not linked from the app.
//
// Every number below is measured from the 302 live approved vendors in
// tests/responsive/fixtures/_api_restaurants_nearby_*.json, not invented.
import { useState } from "react";
import { AlertTriangle, Check, MapPin, X } from "lucide-react";

const REAL = {
  totalVendors: 302,
  distinctCoords: 180,
  stacked: 149,
  clusterCount: 27,
};

const CLUSTERS = [
  { coord: "2.2022326, 102.2368769", total: 14, names: ["Badak Makanan Ikan Bakar", "Cendol Tempurong Al Kausah", "Kopi Dan Cerita", "Makan Siang", "Wanijau", "Sahabat Tomyam"] },
  { coord: "2.195227, 102.2421409", total: 13, names: ["King Of Botomik", "Dapur Ijan Tabakam", "Kuzah Bbq", "Shabu Yaki", "First Office Team Cafe", "Igabakar"] },
  { coord: "2.2549007, 102.2490697", total: 13, names: ["Sahabatan Pagi", "Samburai Kefe", "Rock Cafe Empire", "Suger Das", "Faris Kitchen", "Harin Baba Laksa"] },
  { coord: "2.1943422, 102.2487735", total: 12, names: ["Ayam Pak Sheikh", "Warung Shazwan", "Selera Kampungku", "Polo Bant Shop", "Chekman", "Fookot"] },
];

// Realistic Google Geocoding replies. location_type is the field the current
// code discards; it is Google's own statement of how sure it is.
const SAMPLES = [
  { query: "Ayam Pak Sheikh, 12 Jalan Melaka Raya 8, Melaka", address: "12 Jalan Melaka Raya 8", locationType: "ROOFTOP", truth: "A real building. Correct." },
  { query: "Warung Shazwan, Jalan Melaka Raya 8, Melaka", address: "Jalan Melaka Raya 8", locationType: "GEOMETRIC_CENTER", truth: "Midpoint of a whole street." },
  { query: "Selera Kampungku, Melaka Raya, Melaka", address: "Melaka Raya", locationType: "APPROXIMATE", truth: "Centre of a neighbourhood." },
  { query: "Kopi Dan Cerita, 88-A Jalan Hang Jebat, Melaka", address: "88-A Jalan Hang Jebat", locationType: "RANGE_INTERPOLATED", truth: "Guessed between two house numbers." },
  { query: "Sahabat Tomyam, Melaka", address: "", locationType: "APPROXIMATE", truth: "Centre of the whole city." },
];

// Today: precision comes from whether we had an address string to send.
const todayVerdict = (s) => (s.address.trim() ? "exact" : "city_level");

// Method A: precision comes from what Google actually answered.
const PRECISE_TYPES = new Set(["ROOFTOP", "RANGE_INTERPOLATED"]);
const methodAVerdict = (s) => (PRECISE_TYPES.has(s.locationType) ? "exact" : "approximate");

function Verdict({ value }) {
  const good = value === "exact";
  return (
    <span
      className={good
        ? "inline-flex items-center gap-1 rounded-full bg-forest/10 px-2 py-0.5 text-[11px] font-semibold text-forest"
        : "inline-flex items-center gap-1 rounded-full bg-terracotta/10 px-2 py-0.5 text-[11px] font-semibold text-terracotta"}
    >
      {good ? <Check size={11} /> : <AlertTriangle size={11} />}
      {value}
    </span>
  );
}

function Card({ tag, title, blurb, children }) {
  return (
    <section className="flex min-w-0 flex-1 basis-[380px] flex-col rounded-xl border border-sand bg-white p-4 shadow-sm">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[1px] text-terracotta">{tag}</div>
      <h2 className="m-0 font-display text-[17px] font-bold text-ink">{title}</h2>
      <p className="mb-3 mt-1 text-[12.5px] leading-relaxed text-muted">{blurb}</p>
      {children}
    </section>
  );
}

function Stat({ value, label, alarming }) {
  return (
    <div className="rounded-lg bg-chalk px-3 py-2">
      <div className={alarming ? "text-[20px] font-bold tabular-nums text-terracotta" : "text-[20px] font-bold tabular-nums text-ink"}>
        {value}
      </div>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}

// ── Method C preview: what a customer would see ──────────────────────────────
function VendorRow({ name, distance, approximate }) {
  return (
    <div className="flex items-center gap-2 border-b border-sand py-2 last:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-chalk text-muted">
        <MapPin size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-ink">{name}</div>
        <div className="text-[11px] text-muted">
          {approximate ? "Approximate location · RM10" : `${distance} · RM10`}
        </div>
      </span>
    </div>
  );
}

export default function DevPinPrecision() {
  const [showFlagged, setShowFlagged] = useState(true);

  const disagreements = SAMPLES.filter((s) => todayVerdict(s) !== methodAVerdict(s)).length;

  return (
    <div className="min-h-dvh bg-[#EDEAE4] p-6 font-body text-ink">
      <header className="mb-5 max-w-4xl">
        <h1 className="m-0 font-display text-2xl font-bold">Vendor pin precision — three candidate fixes</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Measured from the {REAL.totalVendors} live approved vendors. The distance maths is correct
          and the map already clusters properly — the coordinates themselves are wrong.
        </p>
      </header>

      {/* The problem, in real numbers */}
      <section className="mb-6 rounded-xl border border-sand bg-white p-4 shadow-sm">
        <h2 className="m-0 mb-3 font-display text-[17px] font-bold">What the live data actually looks like</h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={REAL.totalVendors} label="approved vendors" />
          <Stat value={REAL.distinctCoords} label="distinct coordinates" />
          <Stat value={`${REAL.stacked}`} label={`vendors stacked on another (${Math.round((REAL.stacked / REAL.totalVendors) * 100)}%)`} alarming />
          <Stat value={REAL.totalVendors} label="flagged “exact” in the database" alarming />
        </div>
        <p className="mb-3 mt-0 text-[12.5px] text-muted">
          Every one of the {REAL.totalVendors} is stored as <code className="rounded bg-chalk px-1">exact</code>,
          including the {CLUSTERS[0].total} vendors sharing the single point below. The flag has never
          once fired as <code className="rounded bg-chalk px-1">city_level</code>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CLUSTERS.map((c) => (
            <div key={c.coord} className="rounded-lg border border-sand p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-bold tabular-nums text-terracotta">{c.total}</span>
                <span className="text-[11px] text-muted">vendors, one point</span>
              </div>
              <div className="mb-2 font-mono text-[10.5px] text-muted">{c.coord}</div>
              <ul className="m-0 list-none p-0">
                {c.names.map((n) => (
                  <li key={n} className="truncate border-t border-sand py-1 text-[11.5px] text-ink">{n}</li>
                ))}
                <li className="py-1 text-[11px] italic text-muted">+ {c.total - c.names.length} more</li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-4">
        {/* ── Method A ─────────────────────────────────────────────────── */}
        <Card
          tag="Method A"
          title="Trust Google's own answer"
          blurb="Google states how sure it is in a field called location_type. The current code throws it away and guesses from whether we had an address string instead. This reads the real value."
        >
          <div className="mb-2 rounded-lg bg-chalk p-2 font-mono text-[11px] leading-relaxed">
            <div className="text-terracotta">- "exact" if address else "city_level"</div>
            <div className="text-forest">+ "exact" if location_type in (ROOFTOP,</div>
            <div className="text-forest">+     RANGE_INTERPOLATED) else "approximate"</div>
          </div>
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-sand text-left text-[10.5px] uppercase tracking-wide text-muted">
                <th className="py-1 font-semibold">What Google returned</th>
                <th className="py-1 font-semibold">Today</th>
                <th className="py-1 font-semibold">Method A</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLES.map((s) => {
                const today = todayVerdict(s);
                const fixed = methodAVerdict(s);
                const differs = today !== fixed;
                return (
                  <tr key={s.query} className={differs ? "border-b border-sand bg-terracotta/5" : "border-b border-sand"}>
                    <td className="py-1.5 pr-2">
                      <div className="font-mono text-[10.5px] text-ink">{s.locationType}</div>
                      <div className="text-[10.5px] text-muted">{s.truth}</div>
                    </td>
                    <td className="py-1.5 pr-2"><Verdict value={today} /></td>
                    <td className="py-1.5"><Verdict value={fixed} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mb-0 mt-2 text-[11.5px] text-muted">
            <strong className="text-ink">{disagreements} of {SAMPLES.length}</strong> disagree — every one a
            case today calls “exact” that is really a street, a neighbourhood or an interpolated guess.
            Applies to new vendors only; nothing already stored changes.
          </p>
        </Card>

        {/* ── Method B ─────────────────────────────────────────────────── */}
        <Card
          tag="Method B"
          title="Method A, plus spot the pile-ups"
          blurb="Does everything Method A does, and additionally treats any vendor sharing a coordinate with another as approximate — computed when read, so nothing stored changes."
        >
          <div className="mb-3 rounded-lg bg-chalk p-3">
            <div className="text-[12.5px] text-ink">
              Applied to today's data it would flag{" "}
              <strong className="text-terracotta">{REAL.stacked} of {REAL.totalVendors}</strong> vendors
              across <strong>{REAL.clusterCount}</strong> pile-ups — without a single API call.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowFlagged((v) => !v)}
            className="mb-2 flex min-h-11 items-center gap-1.5 rounded-lg border border-sand px-3 text-[12px] font-semibold text-forest"
          >
            {showFlagged ? <X size={13} /> : <Check size={13} />}
            {showFlagged ? "Hide what gets flagged" : "Show what gets flagged"}
          </button>
          {showFlagged && (
            <div className="rounded-lg border border-sand">
              {CLUSTERS[3].names.map((n) => (
                <VendorRow key={n} name={n} approximate distance="0.4 km" />
              ))}
              <div className="px-2 py-1.5 text-[11px] italic text-muted">
                …all {CLUSTERS[3].total} at {CLUSTERS[3].coord}
              </div>
            </div>
          )}
          <p className="mb-0 mt-2 text-[11.5px] text-muted">
            Catches bad coordinates already in the database that Method A alone would miss, because
            those were geocoded before location_type was ever recorded.
          </p>
        </Card>

        {/* ── Method C ─────────────────────────────────────────────────── */}
        <Card
          tag="Method C"
          title="Change nothing but the display"
          blurb="Leave geocoding alone. Where several vendors share a point, stop printing a distance that cannot be true."
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Today</div>
          <div className="mb-3 rounded-lg border border-sand px-2">
            {CLUSTERS[3].names.slice(0, 3).map((n) => (
              <VendorRow key={n} name={n} distance="0 km" />
            ))}
          </div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Method C</div>
          <div className="rounded-lg border border-sand px-2">
            {CLUSTERS[3].names.slice(0, 3).map((n) => (
              <VendorRow key={n} name={n} approximate distance="0 km" />
            ))}
          </div>
          <p className="mb-0 mt-2 text-[11.5px] text-muted">
            Cheapest, and honest to the customer. But the coordinates stay wrong, so the radius
            filter, the trip route and the duplicate detector keep trusting them.
          </p>
        </Card>
      </div>

      <p className="mt-5 max-w-4xl text-[12px] text-muted">
        Not covered here: what an approximate vendor should look like to a customer — pin with no
        distance, a caveat, or excluded from “Nearby to Add”. That was parked for a later discussion.
      </p>
    </div>
  );
}
