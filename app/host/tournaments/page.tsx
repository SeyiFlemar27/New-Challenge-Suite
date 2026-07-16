"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";

type TournamentChallenge = ReturnType<typeof normalizeChallenge> & Record<string, unknown>;

function isTournament(challenge: Record<string, unknown>) {
  const type = String(challenge.type ?? challenge.challengeType ?? challenge.format ?? "").toLowerCase();
  const tournamentType = String(challenge.tournamentType ?? "none").toLowerCase();
  return type.includes("tournament") || tournamentType !== "none";
}

export default function HostTournamentsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "host-tournaments"], queryFn: fetchDashboard, staleTime: 30_000 });
  const tournaments = useMemo<TournamentChallenge[]>(() => {
    if (!data?.ok) return [];
    return ((data.data?.hostedChallenges ?? []) as ChallengeApiRecord[])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item) }))
      .filter((item) => item.id && isTournament(item));
  }, [data]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  return <PlanFeatureGate feature="tournament_builder" requiredPlan="Host" title="Tournament tools require Host Plan"><AppShell><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><PageTitle title="Tournaments" subtitle="Manage tournament challenges, rounds, and final-stage planning." icon={<Trophy />} /><LinkButton href="/host/tournaments/create" className="w-full sm:w-auto">Create Tournament</LinkButton></div>
    <Card className="mt-6 border-[var(--gold)]/20 bg-[var(--gold)]/5 p-4 text-sm text-slate-300">Hybrid formats can be planned inside live events or tournaments later. There is no standalone hybrid workspace.</Card>
    {isLoading ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}</div> : null}
    {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Tournaments could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}
    {!isLoading && !errorMessage && tournaments.length ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{tournaments.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div> : null}
    {!isLoading && !errorMessage && !tournaments.length ? <Card className="mt-8"><EmptyState icon={<Trophy className="text-[var(--gold)]" />} title="No tournaments yet" body="Tournament challenges you create or manage will appear here." action={<LinkButton href="/host/tournaments/create">Create Tournament</LinkButton>} /></Card> : null}
  </div></AppShell></PlanFeatureGate>;
}
