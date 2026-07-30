"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";

type HybridChallenge = ReturnType<typeof normalizeChallenge> & Record<string, unknown>;

function isHybridCompetition(challenge: Record<string, unknown>) {
  const type = String(challenge.type ?? challenge.competitionType ?? "").toLowerCase();
  const operations = challenge.hostOperations && typeof challenge.hostOperations === "object"
    ? challenge.hostOperations as Record<string, unknown>
    : {};
  return type.includes("hybrid") || operations.hybridCompetition === true;
}

export default function HostHybridCompetitionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "host-hybrid-competitions"],
    queryFn: fetchDashboard,
    staleTime: 30_000
  });
  const competitions = useMemo<HybridChallenge[]>(() => {
    if (!data?.ok) return [];
    return ((data.data?.hostedChallenges ?? []) as ChallengeApiRecord[])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item) }))
      .filter((item) => item.id && isHybridCompetition(item));
  }, [data]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  return <AppShell><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <PageTitle title="Hybrid Competition" subtitle="Manage online qualification, finalist, live final, judging, and results stages." icon={<Target />} />
      <LinkButton href="/host/hybrid/create" className="w-full sm:w-auto">Create Hybrid Competition</LinkButton>
    </div>
    {isLoading ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}</div> : null}
    {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Hybrid competitions could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}
    {!isLoading && !errorMessage && competitions.length ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{competitions.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div> : null}
    {!isLoading && !errorMessage && !competitions.length ? <Card className="mt-8"><EmptyState icon={<Target className="text-[var(--gold)]" />} title="No hybrid competitions yet" body="Hybrid competitions you create or manage will appear here." action={<LinkButton href="/host/hybrid/create">Create Hybrid Competition</LinkButton>} /></Card> : null}
  </div></AppShell>;
}
