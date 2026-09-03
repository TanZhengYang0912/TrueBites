import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FolderInput,
  Trash2,
} from "lucide-react";

const MUTED = "#69717A";
const CARD_FOOTER = "flex h-11 shrink-0 items-center gap-1.5 overflow-hidden rounded-b border border-t-0 border-sand bg-chalk px-3 text-[11px] text-muted";
const PILL = "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px]";

export function FolderPill({ label, count, active, onClick, onDelete }) {
  return (
    <div className={active ? `${PILL} border-forest bg-forest text-white` : `${PILL} border-sand bg-white text-forest`}>
      <button type="button" onClick={onClick} className={active ? "flex min-h-11 min-w-11 items-center justify-center gap-1.5 font-semibold" : "flex min-h-11 min-w-11 items-center justify-center gap-1.5"}>
        {label} <span className="text-[11px] opacity-75">{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          aria-label={`Delete folder ${label}`}
          className="grid min-h-11 min-w-11 place-items-center opacity-60 hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

export function FolderMoveSelect({ row, folders, onMove }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (folders.length === 0) return null;
  const current = folders.find((folder) => folder.id === row.folder_id) || folders[0];

  return (
    <div ref={wrapRef} className="relative">
      <div className={CARD_FOOTER}>
        <FolderInput size={13} color={MUTED} className="shrink-0" />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1 text-[11.5px] font-medium text-ink outline-none"
        >
          <span className="min-w-0 truncate">{current?.name}</span>
          <ChevronDown size={13} color={MUTED} className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"} />
        </button>
      </div>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-[200px] w-full min-w-[170px] overflow-y-auto rounded-lg border border-sand bg-white py-1 shadow-[0_10px_30px_rgba(64,84,74,0.2)]"
        >
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              role="option"
              aria-selected={folder.id === current?.id}
              onClick={() => { onMove(folder.id); setOpen(false); }}
              className={folder.id === current?.id
                ? "flex min-h-9 w-full items-center gap-2 bg-forest/10 px-3 text-left text-[12.5px] font-semibold text-forest"
                : "flex min-h-9 w-full items-center gap-2 px-3 text-left text-[12.5px] text-ink hover:bg-chalk"}
            >
              <Check size={12} className={folder.id === current?.id ? "shrink-0" : "invisible shrink-0"} />
              <span className="min-w-0 truncate">{folder.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function pageList(current, total) {
  const delta = 1;
  const middle = [];
  for (let page = Math.max(2, current - delta); page <= Math.min(total - 1, current + delta); page += 1) middle.push(page);

  const pages = [1];
  if (middle[0] > 2) pages.push("...");
  pages.push(...middle);
  if (middle[middle.length - 1] < total - 1) pages.push("...");
  if (total > 1) pages.push(total);
  return pages;
}

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1 pt-2">
      <button type="button" onClick={() => onChange(1)} disabled={page === 1} aria-label="First page" className="grid min-h-11 min-w-11 place-items-center rounded-md text-forest disabled:opacity-30">
        <ChevronsLeft size={16} />
      </button>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page" className="grid min-h-11 min-w-11 place-items-center rounded-md text-forest disabled:opacity-30">
        <ChevronLeft size={16} />
      </button>
      {pageList(page, totalPages).map((item, index) => (
        item === "..." ? (
          <span key={`ellipsis-${index}`} className="px-1.5 text-[13px] text-muted">…</span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === page ? "page" : undefined}
            className={item === page
              ? "grid min-h-11 min-w-11 place-items-center rounded-md bg-forest text-[13px] font-semibold text-white"
              : "grid min-h-11 min-w-11 place-items-center rounded-md text-[13px] text-ink hover:bg-sand/60"}
          >
            {item}
          </button>
        )
      ))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages} aria-label="Next page" className="grid min-h-11 min-w-11 place-items-center rounded-md text-forest disabled:opacity-30">
        <ChevronRight size={16} />
      </button>
      <button type="button" onClick={() => onChange(totalPages)} disabled={page === totalPages} aria-label="Last page" className="grid min-h-11 min-w-11 place-items-center rounded-md text-forest disabled:opacity-30">
        <ChevronsRight size={16} />
      </button>
    </div>
  );
}

export function Empty({ icon, text }) {
  return (
    <div className="rounded-xl border border-sand bg-white px-5 py-12 text-center text-muted">
      <div className="mb-2 text-[32px]">{icon}</div>
      <div className="text-sm">{text}</div>
    </div>
  );
}
