"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";
import { getChallengeTimelineDisplay } from "@/lib/challenge-status";

function remainingLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${remainder}s`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

export function ChallengeMilestoneCountdown({ challenge }: { challenge: Record<string, unknown> }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const display = useMemo(() => getChallengeTimelineDisplay(challenge, now === null ? new Date(0) : new Date(now)), [challenge, now]);
  if (now === null) return <div className="h-[74px] animate-pulse rounded-[8px] bg-white/[0.04]" aria-label="Loading challenge countdown" />;
  const target = display.nextAt ? Date.parse(display.nextAt) : Number.NaN;
  const hasFuture = Number.isFinite(target) && target > now && display.nextLabel;
  return <div className="flex min-h-[74px] items-center gap-4 rounded-[8px] border border-[var(--gold)]/20 bg-[var(--gold)]/5 px-4 py-3" aria-live="polite">
    <Clock3 className="shrink-0 text-[var(--gold)]" aria-hidden="true" />
    <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{hasFuture ? display.nextLabel : "Current phase"}</p><p className="mt-1 break-words text-lg font-black text-white">{hasFuture ? `${remainingLabel(target - now)}` : display.currentPhase || "Challenge ended"}</p>{hasFuture ? <p className="mt-1 text-xs text-slate-400">{formatChallengeDateTime(display.nextAt, display.timeZone)}</p> : null}</div>
  </div>;
}
