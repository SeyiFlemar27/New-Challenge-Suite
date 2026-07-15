"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { getUserPlanAccess } from "@/lib/plan-access";

type CreatorChallenge = ReturnType<typeof normalizeChallenge> & Record<string, unknown>;

function isPrivateChallenge(challenge: Record<string, unknown>) {
  const visibility = String(challenge.visibility ?? "").toLowerCase();
  const type = String(challenge.type ?? "").toLowerCase();
  return visibility.includes("private") || visibility.includes("exclusive") || type.includes("private") || type.includes("exclusive") || type.includes("invite");
}

export default function CreatorPrivateChallengesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "creator-private-challenges"], queryFn: fetchDashboard, staleTime: 30_000 });
  const user = data?.ok ? data.data?.user : null;
  const planAccess = getUserPlanAccess({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });
  const canCreatePrivate = planAccess.canCreatePrivateChallenges;
  const challenges = useMemo<CreatorChallenge[]>(() => {
    if (!data?.ok) return [];
    return ((data.data?.challenges ?? []) as ChallengeApiRecord[])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item) }))
      .filter((item) => item.id && isPrivateChallenge(item));
  }, [data]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;
  const createAction = canCreatePrivate
    ? <LinkButton href="/private/create" className="w-full sm:w-auto">Create Private Challenge</LinkButton>
    : <Button disabled className="w-full sm:w-auto">Available on Creator Plan</Button>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title="Private Challenges" subtitle="Manage invite-only challenges you created or can access." icon={<LockKeyhole />} />
          {createAction}
        </div>
        {!canCreatePrivate ? <Card className="mt-6 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-5 text-sm leading-6 text-slate-300"><b className="text-white">Upgrade required.</b> Private challenge creation is available on Creator Plan, Host Plan, and Enterprise. Existing invite access remains visible when available.</Card> : null}
        {isLoading ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}</div> : null}
        {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Private challenges could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}
        {!isLoading && !errorMessage && challenges.length ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div> : null}
        {!isLoading && !errorMessage && !challenges.length ? <Card className="mt-8"><EmptyState icon={<LockKeyhole className="text-[var(--gold)]" />} title="No private challenges yet" body="Private challenges you create or are invited to will appear here." action={<div className="flex flex-col gap-3 sm:flex-row">{canCreatePrivate ? <LinkButton href="/private/create">Create Private Challenge</LinkButton> : <LinkButton href="/subscriptions">View Plans</LinkButton>}<LinkButton href="/explore" variant="secondary">Explore Challenges</LinkButton></div>} /></Card> : null}
      </div>
    </AppShell>
  );
}