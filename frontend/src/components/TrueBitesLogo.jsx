// Wordmark used by the landing nav, footer and auth cards. Sizes and tones are
// complete literal class strings so Tailwind's scanner can see every variant.
const SIZE = {
  auth:   { root: "gap-4",   mark: "size-[58px] text-[25px]", title: "text-[25px] tracking-[0.09em]", sub: "text-[11px]" },
  header: { root: "gap-2.5", mark: "size-[38px] text-[16px]", title: "text-[17px] tracking-[0.08em]", sub: "text-[9px]" },
  footer: { root: "gap-3",   mark: "size-12 text-[21px]",     title: "text-[21px] tracking-[0.09em]", sub: "text-[10px]" },
};

const TONE = {
  // `sub` (the "MELAKA · MALAYSIA" line) uses the lighter terracotta on dark
  // backgrounds — plain terracotta reads too low-contrast against bg-forest.
  default: { mark: "border-forest text-forest", title: "text-forest", sub: "text-terracotta" },
  light:   { mark: "border-white/80 text-white", title: "text-white", sub: "text-terracotta-light" },
};

export default function TrueBitesLogo({ size = "auth", tone = "default" }) {
  const s = SIZE[size] ?? SIZE.auth;
  // The footer lockup is always on a dark band, whatever tone the caller passes.
  const t = size === "footer" ? TONE.light : (TONE[tone] ?? TONE.default);

  return (
    <span className={`inline-flex items-center ${s.root}`}>
      <span className={`inline-grid shrink-0 place-items-center rounded-full border-2 font-display font-bold leading-none tracking-[-0.04em] ${s.mark} ${t.mark}`}>
        TB
      </span>
      <span className="grid gap-[3px] text-left leading-none">
        <span className={`font-display font-bold ${s.title} ${t.title}`}>TRUEBITES</span>
        <span className={`font-body font-bold uppercase tracking-[0.18em] ${t.sub} ${s.sub}`}>
          MELAKA · MALAYSIA
        </span>
      </span>
    </span>
  );
}
