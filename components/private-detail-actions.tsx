"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

/** Rendered only by the authorized owner view; management API still verifies permission. */
export function PrivateDetailActions({ challengeId }: { challengeId: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", key); };
  }, [open]);
  return <div ref={root} className="relative ml-auto" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-label="Private challenge actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-amber-600"><MoreVertical size={20} /></button>
    {open ? <div role="menu" aria-label="Private challenge actions" className="absolute right-0 top-12 z-30 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><Link ref={item} role="menuitem" href={`/challenges/${encodeURIComponent(challengeId)}/access`} className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-slate-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none">Manage Access</Link></div> : null}
  </div>;
}
