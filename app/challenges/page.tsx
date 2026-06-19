"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchChallenges } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";

export default function ChallengesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["challenges"],
    queryFn: fetchChallenges,
    staleTime: 30_000
  });

  const challenges = useMemo(() => {
    if (!data?.ok || !data.data?.challenges) return [];
    return data.data.challenges.map((item) => normalizeChallenge(item as ChallengeApiRecord)).filter((item) => item.id);
  }, [data]);

  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  return (
    <AppShell>
      <div className="flex items-start justify-between">
        <PageTitle title="Challenges" subtitle="Browse active, upcoming, and completed competitions" />
        <LinkButton href="/challenges/create">+ Create Challenge</LinkButton>
      </div>

      {isLoading ? (
        <div className="mt-10 grid max-w-6xl grid-cols-2 gap-8">
          {[0, 1, 2, 3].map((item) => <Card key={item} className="h-[430px] animate-pulse bg-[#171717]" />)}
        </div>
      ) : errorMessage ? (
        <Card className="mt-10 max-w-3xl p-8">
          <h2 className="text-2xl font-black text-[var(--gold-2)]">Challenges could not load</h2>
          <p className="mt-3 text-slate-300">{errorMessage}</p>
        </Card>
      ) : challenges.length ? (
        <div className="mt-10 grid max-w-6xl grid-cols-2 gap-8">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div>
      ) : (
        <EmptyState icon={<Trophy />} title="No challenges yet" body="Published challenges will appear here once they are created." action={<LinkButton href="/challenges/create">Create Challenge</LinkButton>} />
      )}
    </AppShell>
  );
}
