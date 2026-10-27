"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ImageIcon, LockKeyhole, Radio, Trophy, Users } from "lucide-react";
import { ContentImage } from "@/components/content-image";
import { LinkButton } from "@/components/ui";

type Row = Record<string, unknown>;
export function ExploreChallengeCard({ challenge }: { challenge: Row }) {
  const [failed, setFailed] = useState<string | null>(null);
  const kind = String(challenge.challengeType ?? "standard");
  const title = String(challenge.title ?? "Untitled challenge");
  const href = String(challenge.detailHref ?? `/challenges/${encodeURIComponent(String(challenge.id))}`);
  const creator = (challenge.creator ?? {}) as Row;
  const cta = (challenge.cta ?? {}) as Row;
  const milestone = challenge.nextMilestone as { label: string; at: string } | null | undefined;
  const source = typeof challenge.coverImageUrl === "string" && /^(https?:\/\/|\/(?!\/))/.test(challenge.coverImageUrl) ? challenge.coverImageUrl : null;
  const Icon = kind === "private" ? LockKeyhole : kind === "live_event" ? Radio : Trophy;
  const badge = kind === "private" ? "bg-violet-100 text-violet-900" : kind === "tournament" ? "bg-blue-100 text-blue-900" : kind === "live_event" ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-950";
  return <article data-mobile-explore-card data-challenge-type={kind} className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
      {source && failed !== source ? <ContentImage src={source} alt={`${title} cover`} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(source)} /> : <div className="flex h-full items-center justify-center text-amber-700" role="img" aria-label={`${title} cover unavailable`}><ImageIcon size={36} aria-hidden="true" /></div>}
      <span className={`absolute left-3 top-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${badge}`}><Icon size={14} aria-hidden="true" />{String(challenge.typeLabel ?? (kind === "standard" ? "Normal Challenge" : kind.replaceAll("_", " ")))}</span>
    </div>
    <div className="flex flex-1 flex-col gap-3 p-4">
      <h2 className="line-clamp-2 text-lg font-bold leading-snug text-slate-950"><Link href={href} className="rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600">{title}</Link></h2>
      <p className="truncate text-sm text-slate-600">{typeof creator.displayName === "string" && creator.displayName ? creator.displayName : "Creator name unavailable"}</p>
      <div className="flex min-h-5 items-start justify-between gap-2 text-xs text-slate-600">
        {challenge.participantCountVisible !== false && typeof challenge.participantCount === "number" && Number.isFinite(challenge.participantCount) ? <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden="true" />{challenge.participantCount.toLocaleString()} joined</span> : <span />}
        {challenge.category ? <span className="min-w-0 break-words text-right">{String(challenge.category)}</span> : null}
      </div>
      {milestone && Number.isFinite(Date.parse(milestone.at)) ? <p className="flex items-start gap-1.5 text-xs text-slate-600"><CalendarDays size={14} className="shrink-0" aria-hidden="true" /><span>{milestone.label} <time dateTime={milestone.at}>{new Date(milestone.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></span></p> : null}
      <LinkButton href={cta.disabled === true ? href : String(cta.href ?? href)} className="mt-auto w-full text-center">{cta.disabled === true ? "View Challenge" : String(cta.label ?? "View Challenge")}</LinkButton>
    </div>
  </article>;
}
