"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { paginationTokens, totalChallengePages } from "@/lib/challenge-pagination";

export function ChallengePagination({ page, total, pageSize, onPageChange, disabled = false, anchorId }: { page: number; total: number; pageSize: number; onPageChange: (page: number) => void; disabled?: boolean; anchorId?: string }) {
  if (total <= 0) return null;
  const totalPages = totalChallengePages(total, pageSize);
  const change = (next: number) => {
    if (disabled || next === page || next < 1 || next > totalPages) return;
    onPageChange(next);
    if (anchorId) requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };
  return <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Challenge result pages" data-challenge-pagination>
    <button type="button" onClick={() => change(page - 1)} disabled={disabled || page <= 1} className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] border border-white/10 px-3 font-bold disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={18} /></button>
    {paginationTokens(page, totalPages).map((token, index) => token === "ellipsis" ? <span key={`ellipsis-${index}`} className="px-2 text-slate-500" aria-hidden="true">…</span> : <button key={token} type="button" aria-current={token === page ? "page" : undefined} aria-label={`Page ${token}`} disabled={disabled} onClick={() => change(token)} className={`min-h-11 min-w-11 rounded-[8px] border px-3 font-black ${token === page ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-white/10 text-slate-300 hover:border-[var(--gold)]/40"}`}>{token}</button>)}
    <button type="button" onClick={() => change(page + 1)} disabled={disabled || page >= totalPages} className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] border border-white/10 px-3 font-bold disabled:opacity-40" aria-label="Next page"><ChevronRight size={18} /></button>
  </nav>;
}
