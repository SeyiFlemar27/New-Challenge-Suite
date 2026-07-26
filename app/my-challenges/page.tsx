"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Target, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { ChallengeMediaFrame } from "@/components/media-display";

type ChallengeRow = ReturnType<typeof normalizeChallenge> & Record<string, unknown>;

export default function MyChallengesPage() {
  const { loading } = useCurrentUser();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "my-challenges"], queryFn: fetchDashboard, staleTime: 30_000 });
  const challenges = useMemo<ChallengeRow[]>(() => {
    if (!data?.ok) return [];
    return ((data.data?.hostedChallenges ?? []) as ChallengeApiRecord[])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item) }))
      .filter((item) => item.id);
  }, [data]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  if (loading || isLoading) {
    return <AppShell><div className="mx-auto max-w-6xl"><div className="h-12 w-80 max-w-full animate-pulse rounded bg-white/10" /><div className="mt-8 space-y-4">{[0, 1, 2].map((item) => <Card key={item} className="h-36 animate-pulse bg-[#151515]" />)}</div></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title="My Challenges" subtitle="Track the challenges you created, continue drafts, and manage active competitions." />
          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/challenges/create" className="w-full sm:w-auto">Create Challenge</LinkButton>
            <LinkButton href="/my-entries" variant="secondary" className="w-full sm:w-auto">View My Entries</LinkButton>
          </div>
        </div>

        {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">My Challenges could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}

        {!errorMessage && challenges.length ? <div className="mt-8 space-y-4">{challenges.map((challenge) => <MyChallengeRow key={challenge.id} challenge={challenge} />)}</div> : null}

        {!errorMessage && !challenges.length ? <Card className="mt-8 overflow-hidden p-0">
          <EmptyState icon={<Target className="text-[var(--gold)]" />} title="No challenges created yet" body="Create your first public challenge and start collecting entries." action={<LinkButton href="/challenges/create">Create Challenge</LinkButton>} />
        </Card> : null}
      </div>
    </AppShell>
  );
}

function MyChallengeRow({ challenge }: { challenge: ChallengeRow }) {
  const status = getChallengeDisplayStatus(challenge);
  const imageUrl = String(challenge.imageUrl ?? "");
  const actionHref = `/challenges/${challenge.id}`;
  const actionLabel = status === "Completed" ? "View Results" : status === "Draft" ? "Continue Editing" : "View Challenge";
  const sponsorState = String(challenge.sponsorFundingStatus ?? challenge.sponsorshipStatus ?? (challenge.confirmedSponsorFundingCents ? "funding_confirmed" : challenge.sponsorEnabled || challenge.sponsorReady ? "discussion_started" : "no_sponsor")).replaceAll("_", " ");
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
        <a href={actionHref} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
          <ChallengeMediaFrame src={imageUrl} alt={challenge.title} className="h-full min-h-40 rounded-none border-0" placeholder="Challenge Suite" />
        </a>
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{status}</p>
              <a href={actionHref} className="mt-2 block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"><h2 className="break-words text-xl font-black sm:text-2xl">{challenge.title}</h2></a>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">{challenge.description || "Challenge details will appear here as you complete the setup."}</p>
            </div>
            <LinkButton href={actionHref} className="shrink-0">{actionLabel}</LinkButton>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <LinkButton href={`/challenges/${challenge.id}/propose-winners`} variant="secondary">Propose Winners</LinkButton>
          </div>
          <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <span className="flex items-center gap-2"><Users size={16} className="text-[var(--gold)]" /> {Number(challenge.participants ?? challenge.participantCount ?? 0)} participants</span>
            <span className="flex items-center gap-2"><CalendarDays size={16} className="text-[var(--gold)]" /> {String(challenge.endsAt ?? "Date not set")}</span>
            <span>{String(challenge.category ?? "General")}</span>
          </div>
          <div className="mt-4 rounded-[8px] border border-white/10 bg-black/25 p-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Sponsor state: {sponsorState}. Confirmed sponsor funds are shown only after webhook-confirmed payment.</div>
        </div>
      </div>
    </Card>
  );
}
