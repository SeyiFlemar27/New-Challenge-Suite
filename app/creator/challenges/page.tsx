"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Medal, Swords } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";

type CreatorChallenge = ReturnType<typeof normalizeChallenge> & Record<string, unknown>;

function isPrivateChallenge(challenge: Record<string, unknown>) {
  const visibility = String(challenge.visibility ?? "").toLowerCase();
  const type = String(challenge.type ?? "").toLowerCase();
  return visibility.includes("private") || visibility.includes("exclusive") || type.includes("private") || type.includes("exclusive") || type.includes("invite");
}

export default function CreatorChallengesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "creator-challenges"], queryFn: fetchDashboard, staleTime: 30_000 });
  const challenges = useMemo<CreatorChallenge[]>(() => {
    if (!data?.ok) return [];
    return ((data.data?.hostedChallenges ?? []) as ChallengeApiRecord[])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item) }))
      .filter((item) => item.id && !isPrivateChallenge(item));
  }, [data]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title="Challenges" subtitle="Manage public challenges you created." icon={<Medal />} />
          <LinkButton href="/challenges/create" className="w-full sm:w-auto">Create Challenge</LinkButton>
        </div>
        {isLoading ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}</div> : null}
        {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Challenges could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}
        {!isLoading && !errorMessage && challenges.length ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div> : null}
        {!isLoading && !errorMessage && !challenges.length ? <Card className="mt-8"><EmptyState icon={<Swords className="text-[var(--gold)]" />} title="No public challenges yet" body="Create a public challenge for competitors to discover and join." action={<LinkButton href="/challenges/create">Create Challenge</LinkButton>} /></Card> : null}
      </div>
    </AppShell>
  );
}