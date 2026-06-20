"use client";

import { CheckCircle2, ChevronRight, Search, UploadCloud } from "lucide-react";
import { useState } from "react";
import type { PreviewChallenge, PreviewSubmission } from "@/lib/mobile-preview/data";
import { cn } from "@/lib/utils";
import { MiniMetric, MobileBadge, MobileButton, MobileCard } from "./ui";

export function SearchBox() {
  return <div className="flex h-12 items-center gap-3 rounded-[16px] border border-white/10 bg-[#121212] px-4 text-slate-400"><Search size={18} /><span className="text-sm">Search challenges...</span></div>;
}

export function SegmentedTabs({ items }: { items: string[] }) {
  const [active, setActive] = useState(items[0]);
  return <div className="scrollbar-dark flex gap-2 overflow-x-auto rounded-[16px] border border-white/10 bg-[#101010] p-2">{items.map((item) => <button key={item} onClick={() => setActive(item)} className={cn("h-10 shrink-0 rounded-[12px] px-4 text-xs font-black", active === item ? "bg-[var(--gold)] text-black" : "bg-[#191919] text-slate-300")}>{item}</button>)}</div>;
}

export function MobileChallengeCard({ challenge, onClick, compact = false }: { challenge: PreviewChallenge; onClick: () => void; compact?: boolean }) {
  return <button onClick={onClick} className="w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#121212] text-left"><div className={cn("relative", compact ? "h-36" : "h-44")}><img src={challenge.imageUrl} alt={challenge.title} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />{challenge.boosted ? <span className="absolute left-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-xs font-black">Boosted</span> : null}<span className="absolute right-3 top-3 rounded-full bg-black/80 px-3 py-1 text-xs font-black">{challenge.category}</span></div><div className="p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black leading-tight">{challenge.title}</h3><MobileBadge>{challenge.status}</MobileBadge></div><p className="mt-2 line-clamp-2 text-sm text-slate-300">{challenge.description}</p><div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-400"><span>{challenge.participants} players</span><span className="text-[var(--gold)]">{challenge.prize}</span><span>{challenge.deadline}</span></div></div></button>;
}

export function SubmissionRow({ submission, onClick }: { submission: PreviewSubmission; onClick?: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-[16px] border border-white/10 bg-[#121212] p-3 text-left"><img src={submission.mediaUrl} alt={submission.title} className="h-16 w-16 rounded-[12px] object-cover" /><div className="min-w-0 flex-1"><div className="truncate font-black">{submission.title}</div><div className="text-xs text-slate-400">#{submission.rank} • {submission.votes.toLocaleString()} votes</div></div><ChevronRight size={18} className="text-slate-500" /></button>;
}

export function LeaderboardRow({ row, compact = false }: { row: { rank: number; name: string; badge: string; points: string }; compact?: boolean }) {
  return <div className="flex items-center gap-3 rounded-[16px] border border-white/10 bg-[#121212] p-3"><div className={cn("flex items-center justify-center rounded-full font-black", compact ? "h-9 w-9" : "h-12 w-12", row.rank === 1 ? "bg-[var(--gold)] text-black" : "bg-[#222] text-white")}>#{row.rank}</div><div className="min-w-0 flex-1"><div className="truncate font-black">{row.name}</div><div className="text-xs text-slate-400">{row.badge}</div></div><div className="font-black text-[var(--gold)]">{row.points}</div></div>;
}

export function WalletPackage({ pack, onClick }: { pack: { coins: number; price: string; label: string; bestFor: string }; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center justify-between rounded-[16px] border border-white/10 bg-[#121212] p-4 text-left"><div><div className="text-xl font-black text-[var(--gold)]">{pack.coins} coins</div><div className="text-xs text-slate-400">{pack.label} • {pack.bestFor}</div></div><div className="text-lg font-black">{pack.price}</div></button>;
}

export function WinnerCard({ submission, onClick }: { submission: PreviewSubmission; onClick: () => void }) {
  return <button onClick={onClick} className="w-full overflow-hidden rounded-[18px] border border-yellow-400/20 bg-[#11151d] text-left"><div className="relative h-44"><img src={submission.mediaUrl} alt={submission.title} className="h-full w-full object-cover" /><span className="absolute right-3 top-3 rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-black text-black">Winner</span></div><div className="p-4"><h3 className="text-lg font-black">{submission.title}</h3><p className="mt-1 text-sm text-slate-300">{submission.creator} • {submission.votes.toLocaleString()} votes</p></div></button>;
}

export function StepPill({ step, title, done }: { step: string; title: string; done?: boolean }) {
  return <div className="flex items-center gap-3 rounded-[16px] border border-white/10 bg-[#121212] p-4"><div className={cn("flex h-9 w-9 items-center justify-center rounded-full font-black", done ? "bg-emerald-400 text-black" : "bg-[var(--gold)] text-black")}>{done ? <CheckCircle2 size={18} /> : step}</div><div className="font-black">{title}</div></div>;
}

export function UploadDropzone() {
  return <MobileCard className="p-4"><div className="flex h-40 items-center justify-center rounded-[14px] border border-dashed border-yellow-400/40 bg-yellow-500/5 text-center"><div><UploadCloud className="mx-auto text-[var(--gold)]" /><p className="mt-2 text-sm font-bold">Tap to upload image or video</p><p className="mt-1 text-xs text-slate-500">Preview only</p></div></div></MobileCard>;
}

export function VoteAmountGrid({ selected, setSelected }: { selected: string; setSelected: (value: string) => void }) {
  return <div className="grid grid-cols-3 gap-3">{["10", "50", "100"].map((amount) => <button key={amount} onClick={() => setSelected(amount)} className={cn("rounded-[14px] border p-4 text-center", selected === amount ? "border-yellow-400 bg-yellow-500/10" : "border-white/10 bg-[#121212]")}><div className="text-xl font-black">{amount}</div><div className="text-xs text-slate-400">votes</div></button>)}</div>;
}

export function StatusMetrics({ challenge }: { challenge: PreviewChallenge }) {
  return <div className="grid grid-cols-3 gap-3"><MiniMetric label="Prize" value={challenge.prize} /><MiniMetric label="Players" value={String(challenge.participants)} /><MiniMetric label="Votes" value={challenge.votes.toLocaleString()} /></div>;
}

export function EmptyPreview({ title, body }: { title: string; body: string }) {
  return <MobileCard className="p-8 text-center"><div className="mx-auto mb-4 h-10 w-10 rounded-full bg-yellow-500/10" /><h3 className="text-xl font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{body}</p><MobileButton className="mt-5" variant="secondary">Retry</MobileButton></MobileCard>;
}
