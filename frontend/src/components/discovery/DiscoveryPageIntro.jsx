export default function DiscoveryPageIntro({ eyebrow, title, description, action = null, className = "" }) {
  return (
    <div className={`mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between ${className}`.trim()}>
      <div>
        <p className="mb-3 mt-0 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">{eyebrow}</p>
        <h1 className="m-0 max-w-3xl font-display text-[clamp(32px,4vw,54px)] font-medium leading-[1.05] tracking-[-0.04em] text-ink">{title}</h1>
        <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
