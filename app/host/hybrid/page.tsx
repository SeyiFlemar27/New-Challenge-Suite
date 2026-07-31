"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { Card, EmptyState, PageTitle } from "@/components/ui";
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
    <PageTitle title="Archived Competition History" subtitle="Historical Hybrid Competition records remain available for reference. This format is no longer available for new competitions." icon={<Target />} />
    {isLoading ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}</div> : null}
    {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Hybrid competitions could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}
    {!isLoading && !errorMessage && competitions.length ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{competitions.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div> : null}
    {!isLoading && !errorMessage && !competitions.length ? <Card className="mt-8"><EmptyState icon={<Target className="text-[var(--gold)]" />} title="No archived competitions" body="There are no historical Hybrid Competition records associated with this account." /></Card> : null}
  </div></AppShell>;
}
