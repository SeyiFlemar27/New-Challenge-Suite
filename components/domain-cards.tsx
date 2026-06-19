import Link from "next/link";
import { Heart, Star, Trophy, Users, Hourglass, Crown, LockKeyhole, Rocket } from "lucide-react";
import type { Challenge, Submission, UserPlanId } from "@/lib/types";
import { Card, LinkButton } from "./ui";
import { getChallengeDisplayStatus, statusClassName } from "@/lib/challenge-status";
import { PremiumBadge } from "./brand";

type SubmissionWithProfile = Submission & {
  userPlanId?: UserPlanId;
};

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const displayStatus = getChallengeDisplayStatus(challenge);
  return (
    <Card className="overflow-hidden bg-[#171717]">
      <div className="relative h-44 overflow-hidden">
        <img src={challenge.imageUrl} alt={challenge.title} className="h-full w-full object-cover" />
        <span className="absolute right-5 top-5 rounded-full bg-black px-4 py-2 text-xs font-black text-white">{challenge.category}</span>
        <span className={`absolute bottom-4 right-4 rounded-full px-3 py-2 text-xs font-black ${statusClassName(displayStatus)}`}>{displayStatus}</span>
        {challenge.type === "Private / Exclusive" ? <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-yellow-500 px-3 py-2 text-xs font-black text-black"><LockKeyhole size={13} /> Invite-only</span> : null}
        {challenge.id === "neon-city-photo" ? <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-2 text-xs font-black text-white"><Rocket size={13} /> Boosted</span> : null}
      </div>
      <div className="p-6">
        <h3 className="text-xl font-black">{challenge.title}</h3>
        <p className="mt-2 text-slate-200">{challenge.description}</p>
        <div className="mt-5 flex gap-8 text-sm text-slate-300">
          <span className="flex items-center gap-2"><Users size={16} className="text-purple-400" /> {challenge.participants}</span>
          <span className="flex items-center gap-2"><Hourglass size={16} className="text-yellow-300" /> {challenge.endsAt}</span>
        </div>
        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="mb-3 flex justify-between text-sm"><span>Status</span><span className="text-[var(--gold)]">{displayStatus}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-[var(--gold)]" /></div>
        </div>
        <LinkButton href={`/challenges/${challenge.id}`} variant="ghost" className="mt-5 w-full bg-indigo-950/60 text-[var(--gold)]">View Details</LinkButton>
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
            <div className="text-sm text-sky-300">{submission.createdAt}</div>
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
        <LinkButton href={`/submissions/${submission.id}`} variant="secondary">WATCH</LinkButton>
      </div>
    </Card>
  );
}

export function WinnerCard({ submission }: { submission: SubmissionWithProfile }) {
  return (
    <Card className="overflow-hidden bg-[#0f141d]">
      <div className="relative h-40">
        <img src={submission.mediaUrl} alt={submission.title} className="h-full w-full object-cover" />
        <span className="absolute right-3 top-3 flex items-center gap-2 rounded-[5px] bg-[var(--gold)] px-3 py-2 text-xs font-black text-black"><Trophy size={14} /> WINNER</span>
      </div>
      <div className="p-5">
        <h3 className="text-lg font-black">{submission.challengeTitle}</h3>
        <div className="mt-4 flex items-center gap-3 text-[var(--gold)]">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs text-white">{submission.userInitials}</div>
          <span className="flex items-center gap-2 font-black">{submission.userName}<PremiumBadge planId={submission.userPlanId} compact /></span>
        </div>
        <div className="mt-5 border-t border-white/10 pt-4 font-bold"><Heart size={17} className="mr-2 inline fill-pink-500 text-pink-500" /> {submission.likes.toLocaleString()} Votes</div>
        <LinkButton href={`/submissions/${submission.id}`} className="mt-4 w-full">View Winner</LinkButton>
      </div>
    </Card>
  );
}

export function PlanBadge() {
  return <span className="inline-flex items-center gap-2 rounded-full bg-[var(--gold)] px-8 py-4 text-lg font-black text-black gold-glow"><Crown size={19} /> Member</span>;
}
