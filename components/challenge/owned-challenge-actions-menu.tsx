"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ClipboardList, Eye, FilePenLine, MoreVertical, Trophy } from "lucide-react";

export function OwnedChallengeActionsMenu({ challengeId, draft }: { challengeId: string; draft: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { function close(event: MouseEvent) { if (!ref.current?.contains(event.target as Node)) setOpen(false); } document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const links = draft ? [{ href: `/challenges/create/${challengeId}`, label: "Edit draft", icon: <FilePenLine size={16} /> }, { href: `/challenges/${challengeId}`, label: "Preview draft", icon: <Eye size={16} /> }] : [{ href: `/challenges/${challengeId}`, label: "View challenge", icon: <Eye size={16} /> }, { href: `/challenges/${challengeId}/entry-requests`, label: "Entry requests", icon: <ClipboardList size={16} /> }, { href: `/challenges/${challengeId}/propose-winners`, label: "Propose winners", icon: <Trophy size={16} /> }];
  return <div className="relative" ref={ref}><button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10 bg-white/5 text-slate-200 hover:border-[var(--gold)]/50" aria-label="Open challenge actions" aria-haspopup="menu" aria-expanded={open}><MoreVertical size={18} /></button>{open ? <div role="menu" className="absolute bottom-full right-0 z-40 mb-2 w-56 rounded-[8px] border border-slate-700 bg-slate-950 p-2 shadow-xl">{links.map((item) => <Link key={item.href} role="menuitem" href={item.href} className="flex min-h-10 items-center gap-3 rounded-[6px] px-3 text-sm font-bold text-slate-200 hover:bg-white/10">{item.icon}{item.label}</Link>)}</div> : null}</div>;
}
