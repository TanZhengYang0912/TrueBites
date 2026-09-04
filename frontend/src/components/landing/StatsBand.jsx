// Forest band with three Inter stat numbers (600+ / 14 / UNESCO).
// Two columns on phones with the last stat spanning the full width; three
// across from md. The hairline dividers come from the grid gap showing through.
const STATS = [
  { number: "600+",   label: "Years of Heritage" },
  { number: "14",     label: "Ethnic Cuisines" },
  { number: "UNESCO", label: "World Heritage City" },
];

export default function StatsBand() {
  return (
    <div className="bg-forest px-5 py-12 md:px-12 md:py-18">
      <div className="mx-auto grid max-w-[960px] grid-cols-2 gap-px bg-white/12 md:grid-cols-3">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className={i === STATS.length - 1
              ? "col-span-2 bg-forest px-4 py-6 text-center md:col-span-1 md:px-8"
              : "bg-forest px-4 py-6 text-center md:px-8"}
          >
            <div className="mb-2.5 font-display text-[clamp(36px,5vw,64px)] font-extrabold leading-none tracking-[-0.01em] text-white">
              {s.number}
            </div>
            <div className="font-body text-xs font-medium uppercase tracking-[2.5px] text-terracotta">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
