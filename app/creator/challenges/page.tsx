"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, Medal, Swords, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";
import { CREATOR_CHALLENGE_TABS, CREATOR_CHALLENGE_TAB_LABELS, type CreatorChallengeTab } from "@/lib/creator-challenges";

type CreatorChallenge = Record<string, unknown> & { id: string; productStatusGroup: CreatorChallengeTab };
type Payload = { challenges: CreatorChallenge[]; counts: Record<CreatorChallengeTab, number>; total: number };

function challengeTypeLabel(challenge: CreatorChallenge) {
  const value = String(challenge.challengeType ?? challenge.type ?? "normal").toLowerCase();
  if (value.includes("private")) return "Private Challenge";
  if (value.includes("live") || challenge.isLiveEvent) return "Live Event Challenge";
  if (value.includes("tournament")) return "Tournament Challenge";
  return "Normal Challenge";
}

function nextDeadline(challenge: CreatorChallenge) {
  const candidates = [challenge.registrationDeadline, challenge.submissionStartAt, challenge.submissionDeadline, challenge.votingDeadline, challenge.winnerAnnouncementAt]
    .map((value) => ({ value, time: Date.parse(String(value ?? "")) }))
    .filter((item) => Number.isFinite(item.time) && item.time > Date.now())
    .sort((left, right) => left.time - right.time);
  return candidates[0]?.value ? formatChallengeDateTime(candidates[0].value, challenge) : null;
}

export default function CreatorChallengesPage() {
  const [activeTab, setActiveTab] = useState<CreatorChallengeTab>("active");
  const query = useQuery({ queryKey: ["creator-challenges"], queryFn: () => apiRequest<Payload>("/api/creator/challenges"), staleTime: 20_000 });
  const payload = query.data?.ok ? query.data.data : null;
  const challenges = useMemo(() => (payload?.challenges ?? []).filter((challenge) => challenge.productStatusGroup === activeTab), [activeTab, payload]);

  return <AppShell><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><PageTitle title="Challenges" subtitle="Manage every challenge you create or host." icon={<Medal />} /><LinkButton href="/challenges/create" className="w-full sm:w-auto">Create Challenge</LinkButton></div>
    <div className="mt-7 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Challenge status">
      {CREATOR_CHALLENGE_TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`min-h-11 shrink-0 rounded-[8px] border px-4 text-sm font-black ${activeTab === tab ? "border-[var(--gold)] bg-[var(--gold)] text-black" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-[var(--gold)]/35"}`}>{CREATOR_CHALLENGE_TAB_LABELS[tab]} {payload ? <span aria-label={`${payload.counts[tab]} challenges`}>({payload.counts[tab]})</span> : null}</button>)}
    </div>
    {query.isLoading ? <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}</div> : null}
    {!query.isLoading && !payload ? <Card className="mt-7 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Challenges could not load</h2><p className="mt-2 text-slate-300">{query.data?.message ?? "Please try again."}</p></Card> : null}
    {payload && challenges.length ? <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{challenges.map((challenge) => <CreatorChallengeCard key={challenge.id} challenge={challenge} />)}</div> : null}
    {payload && !challenges.length ? <Card className="mt-7"><EmptyState icon={<Swords className="text-[var(--gold)]" />} title={`No challenges in ${CREATOR_CHALLENGE_TAB_LABELS[activeTab]}`} body="Challenges will appear here when they reach this stage." action={activeTab === "drafts" ? <LinkButton href="/challenges/create">Create Challenge</LinkButton> : undefined} /></Card> : null}
  </div></AppShell>;
}

function CreatorChallengeCard({ challenge }: { challenge: CreatorChallenge }) {
  const image = String(challenge.coverImageUrl ?? (Array.isArray(challenge.challengeImages) ? challenge.challengeImages[0] : "") ?? "");
  const title = String(challenge.title ?? "Untitled challenge");
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "draft").replaceAll("_", " ");
  const pending = Number(challenge.pendingRequestCount ?? challenge.pendingEntryRequestCount ?? 0);
  return <Card className="flex h-full flex-col overflow-hidden bg-[#171717]">
    <div className="relative aspect-[16/9] bg-[#101010]">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm font-black uppercase tracking-[0.14em] text-[var(--gold)]">Challenge Suite</div>}<span className="absolute left-3 top-3 rounded-[6px] bg-black/80 px-3 py-2 text-[11px] font-black text-white">{challengeTypeLabel(challenge)}</span></div>
    <div className="flex flex-1 flex-col p-5"><p className="text-xs font-black uppercase text-[var(--gold)]">{status}</p><h2 className="mt-2 line-clamp-2 text-xl font-black">{title}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-slate-300"><span className="flex items-center gap-2"><Users size={15} /> {Number(challenge.participantCount ?? 0)} participants</span><span className="flex items-center gap-2"><ClipboardList size={15} /> {Number(challenge.submissionCount ?? 0)} submissions</span>{pending > 0 ? <span className="col-span-2 font-black text-amber-300">{pending} participant requests need review</span> : null}<span className="col-span-2 flex items-center gap-2"><CalendarClock size={15} /> {nextDeadline(challenge) ?? "No upcoming deadline"}</span></div>
      <div className="mt-auto grid gap-2 pt-6"><LinkButton href={`/challenges/${challenge.id}/manage`} className="w-full">Manage Challenge</LinkButton><LinkButton href={`/challenges/${challenge.id}`} variant="secondary" className="w-full">View Public Page</LinkButton></div>
    </div>
  </Card>;
}
