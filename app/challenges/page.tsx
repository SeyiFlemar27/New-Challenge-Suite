"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeMediaFrame } from "@/components/media-display";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getChallengeDisplayStatus, statusClassName } from "@/lib/challenge-status";

export default function ChallengesPage() {
  const { user } = useCurrentUser();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "owned-challenges"], queryFn: fetchDashboard, staleTime: 30_000 });
  const challenges = useMemo(() => {
    if (!data?.ok) return [];
    return (data.data?.hostedChallenges ?? [])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item as ChallengeApiRecord) }))
      .filter((item) => item.id);
  }, [data]);
  const accountType = String(user?.selectedAccountType ?? user?.accountType ?? user?.role ?? "user").toLowerCase();
  const canCreate = accountType !== "sponsor";
  const errorMessage = !isLoading && data && !data.ok ? data.message : "";

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Challenges" subtitle="Create and manage your challenges." icon={<Trophy className="text-[var(--gold)]" />} />
        {canCreate ? <LinkButton href="/challenges/create" className="w-full sm:w-auto">Create Challenge</LinkButton> : null}
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <Card key={item} className="h-[340px] animate-pulse bg-[#171717]" />)}
        </div>
      ) : errorMessage ? (
        <Card className="mt-8 max-w-3xl p-6">
          <h2 className="text-2xl font-black text-[var(--gold-2)]">Challenges could not load</h2>
          <p className="mt-3 text-slate-300">{errorMessage}</p>
        </Card>
      ) : challenges.length ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {challenges.map((challenge) => <OwnedChallengeCard key={String(challenge.id)} challenge={challenge as Record<string, unknown>} />)}
        </div>
      ) : (
        <Card className="mt-8 p-8">
          <EmptyState icon={<Trophy />} title="No challenges created yet." body="Create a challenge when you are ready." action={canCreate ? <LinkButton href="/challenges/create">Create Challenge</LinkButton> : undefined} />
        </Card>
      )}
    </AppShell>
  );
}

function OwnedChallengeCard({ challenge }: { challenge: Record<string, unknown> }) {
  const id = String(challenge.id ?? "");
  const status = getChallengeDisplayStatus(challenge);
  const participants = Number(challenge.participantCount ?? challenge.participants ?? 0);
  const submissions = Number(challenge.submissionCount ?? challenge.submissions ?? 0);
  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <ChallengeMediaFrame src={String(challenge.imageUrl ?? challenge.coverImageUrl ?? "")} alt={String(challenge.title ?? "Challenge")} className="rounded-none border-0" placeholder="Challenge Suite" />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${statusClassName(status)}`}>{status}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase text-slate-300">{String(challenge.category ?? "General")}</span>
        </div>
        <h2 className="mt-4 line-clamp-2 text-xl font-black">{String(challenge.title ?? "Untitled Challenge")}</h2>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-slate-300">{String(challenge.description ?? "")}</p>
        <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
          <span className="flex items-center gap-2"><Users size={16} className="text-[var(--gold)]" /> {participants.toLocaleString()} participants</span>
          <span className="flex items-center gap-2"><CalendarDays size={16} className="text-[var(--gold)]" /> {submissions.toLocaleString()} entries</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <LinkButton href={`/challenges/${id}`} className="w-full">View Challenge</LinkButton>
          <LinkButton href={`/challenges/${id}/propose-winners`} variant="secondary" className="w-full">Propose Winners</LinkButton>
        </div>
      </div>
    </Card>
  );
}

