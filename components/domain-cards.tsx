import Link from "next/link";
import { CalendarDays, Heart, Star, Trophy, Users, Crown, LockKeyhole, Rocket } from "lucide-react";
import type { Challenge, Submission, UserPlanId } from "@/lib/types";
import { Card, LinkButton } from "./ui";
import { getChallengeDisplayStatus, statusClassName } from "@/lib/challenge-status";
import { PremiumBadge } from "./brand";

type SubmissionWithProfile = Submission & {
  userPlanId?: UserPlanId;
  challengeImageUrl?: string;
  position?: number;
  rank?: number;
  prizeStatusLabel?: string;
};

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const displayStatus = getChallengeDisplayStatus(challenge);
  return (
    <Card className="group flex h-full flex-col overflow-hidden bg-[#171717] transition hover:border-[var(--gold)]/35">
      <Link href={`/challenges/${challenge.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`View details for ${challenge.title}`}>
        <div className="relative aspect-[16/10] overflow-hidden">
          <img src={challenge.imageUrl} alt={challenge.title} className="h-full w-full object-cover" />
          <span className="absolute right-4 top-4 max-w-[calc(100%-2rem)] rounded-full bg-black/80 px-3 py-2 text-[11px] font-black uppercase tracking-[.12em] text-white backdrop-blur">{challenge.category}</span>
          <span className={`absolute bottom-4 right-4 max-w-[calc(100%-2rem)] rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[.1em] ${statusClassName(displayStatus)}`}>{displayStatus}</span>
          {challenge.type === "Private / Exclusive" ? <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-yellow-500 px-3 py-2 text-xs font-black text-black"><LockKeyhole size={13} /> Invite-only</span> : null}
          {challenge.id === "neon-city-photo" ? <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-[var(--gold)] px-3 py-2 text-xs font-black text-black"><Rocket size={13} /> Boosted</span> : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <Link href={`/challenges/${challenge.id}`} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`View details for ${challenge.title}`}>
          <h3 className="line-clamp-2 text-xl font-black transition group-hover:text-[var(--gold)]">{challenge.title}</h3>
        </Link>
        <p className="mt-2 line-clamp-2 text-slate-200">{challenge.description}</p>
        <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
          <span className="flex min-w-0 items-center gap-2"><Users size={16} className="shrink-0 text-[var(--gold)]" /> <span className="truncate">{challenge.participants} participants</span></span>
          <span className="flex min-w-0 items-center gap-2"><CalendarDays size={16} className="shrink-0 text-yellow-300" /> <span className="truncate">{challenge.endsAt}</span></span>
        </div>
        <div className="mt-auto pt-5">
          <LinkButton href={`/challenges/${challenge.id}`} variant="ghost" className="w-full border border-[var(--gold)]/30 bg-[var(--gold)]/5 text-[var(--gold)]">View Details</LinkButton>
        </div>
      </div>
    </Card>
  );
}

export function SubmissionCard({ submission }: { submission: SubmissionWithProfile }) {
  return (
    <Card className="overflow-hidden bg-[#191919]">
      <div className="flex h-22 items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-xs">{submission.userInitials}</div>
          <div>
            <div className="flex items-center gap-2 font-black">{submission.userName}<PremiumBadge planId={submission.userPlanId} compact /></div>
            <div className="text-sm text-slate-400">{submission.createdAt}</div>
          </div>
        </div>
        <span className="rounded-[8px] border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs font-black uppercase text-[var(--gold)]">{submission.challengeTitle}</span>
      </div>
      <Link href={`/submissions/${submission.id}`}>
        <img src={submission.mediaUrl} alt={submission.title} className="h-[420px] w-full object-cover" />
      </Link>
      <div className="flex items-center justify-between p-6">
        <div className="flex gap-4">
          <span className="flex h-11 items-center gap-2 rounded-[8px] bg-[#222] px-5 font-bold"><Heart size={18} className="fill-white text-white" /> {submission.likes}</span>
          <span className="flex h-11 items-center rounded-[8px] bg-[#222] px-5"><Star size={18} /></span>
        </div>
        <LinkButton href={`/submissions/${submission.id}`} variant="secondary">View Entry</LinkButton>
      </div>
    </Card>
  );
}

export function WinnerCard({ submission }: { submission: SubmissionWithProfile }) {
  const visualUrl = submission.mediaUrl || submission.challengeImageUrl || "";
  const rank = submission.position ?? submission.rank;
  const prizeLabel = submission.prizeStatusLabel ?? "Winner announced";
  return (
    <Card className="group flex h-full flex-col overflow-hidden bg-[#0f141d] transition hover:border-[var(--gold)]/35">
      <Link href={`/winners/${submission.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`View winner ${submission.userName}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(246,198,75,.18),transparent_45%),#111827]">
          {visualUrl ? <img src={visualUrl} alt={submission.title || submission.challengeTitle || "Winning submission"} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm font-black uppercase tracking-[0.16em] text-[var(--gold)]">Challenge Suite Winner</div>}
          <span className="absolute left-3 top-3 flex items-center gap-2 rounded-[6px] bg-[var(--gold)] px-3 py-2 text-[11px] font-black uppercase tracking-[.1em] text-black"><Trophy size={14} /> Winner</span>
          {rank ? <span className="absolute bottom-3 right-3 rounded-full bg-black/80 px-3 py-2 text-[11px] font-black uppercase tracking-[.12em] text-white">Rank #{rank}</span> : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <Link href={`/winners/${submission.id}`} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-label={`View winner result for ${submission.challengeTitle}`}>
          <h3 className="line-clamp-2 text-lg font-black transition group-hover:text-[var(--gold)]">{submission.challengeTitle || submission.title}</h3>
        </Link>
        <div className="mt-4 flex items-center gap-3 text-[var(--gold)]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{submission.userInitials}</div>
          <span className="flex min-w-0 items-center gap-2 font-black"><span className="truncate">{submission.userName}</span><PremiumBadge planId={submission.userPlanId} compact /></span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{submission.likes.toLocaleString()} votes</span>
          <span className="rounded-full border border-[var(--gold)]/20 bg-[var(--gold)]/10 px-3 py-1 text-[var(--gold)]">{prizeLabel}</span>
        </div>
        <div className="mt-auto pt-5"><LinkButton href={`/winners/${submission.id}`} className="w-full">View Winner</LinkButton></div>
      </div>
    </Card>
  );
}

export function PlanBadge() {
  return <span className="inline-flex items-center gap-2 rounded-full bg-[var(--gold)] px-8 py-4 text-lg font-black text-black gold-glow"><Crown size={19} /> Member</span>;
}


