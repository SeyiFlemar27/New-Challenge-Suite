"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/domain-cards";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { getUserPlanAccess } from "@/lib/plan-access";

type HostChallenge = ReturnType<typeof normalizeChallenge> & Record<string, unknown>;

function isPrivateChallenge(challenge: Record<string, unknown>) {
  const visibility = String(challenge.visibility ?? "").toLowerCase();
  const type = String(challenge.type ?? "").toLowerCase();
  return visibility.includes("private") || visibility.includes("exclusive") || type.includes("private") || type.includes("exclusive") || type.includes("invite");
}

export default function HostPrivateChallengesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "host-private-challenges"], queryFn: fetchDashboard, staleTime: 30_000 });
  const user = data?.ok ? data.data?.user : null;
  const canCreatePrivate = getUserPlanAccess({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType }).canCreatePrivateChallenges;
  const challenges = useMemo<HostChallenge[]>(() => {
    if (!data?.ok) return [];
    return ((data.data?.challenges ?? []) as ChallengeApiRecord[])
      .map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item) }))
      .filter((item) => item.id && isPrivateChallenge(item));
  }, [data]);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  return <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan."><AppShell><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><PageTitle title="Private Challenges" subtitle="Manage invite-only challenges you created or can access." icon={<LockKeyhole />} />{canCreatePrivate ? <LinkButton href="/creator/private-challenges/create" className="w-full sm:w-auto">Create Private Challenge</LinkButton> : <Button disabled className="w-full sm:w-auto">Available on Creator Plan</Button>}</div>
    {!canCreatePrivate ? <Card className="mt-6 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-5 text-sm leading-6 text-slate-300"><b className="text-white">Upgrade required.</b> Private challenge creation follows the existing plan access rules.</Card> : null}
    {isLoading ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-[390px] animate-pulse bg-[#151515]" />)}</div> : null}
    {errorMessage ? <Card className="mt-8 p-6"><h2 className="text-xl font-black text-[var(--gold-2)]">Private challenges could not load</h2><p className="mt-2 text-slate-300">{errorMessage}</p></Card> : null}
    {!isLoading && !errorMessage && challenges.length ? <div className="mt-8 grid gap-7 sm:grid-cols-2 xl:grid-cols-3">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div> : null}
    {!isLoading && !errorMessage && !challenges.length ? <Card className="mt-8"><EmptyState icon={<LockKeyhole className="text-[var(--gold)]" />} title="No private challenges yet" body="Private challenges you create or are invited to will appear here." action={<div className="flex flex-col gap-3 sm:flex-row">{canCreatePrivate ? <LinkButton href="/creator/private-challenges/create">Create Private Challenge</LinkButton> : <LinkButton href="/subscriptions">View Plans</LinkButton>}<LinkButton href="/explore" variant="secondary">Explore Challenges</LinkButton></div>} /></Card> : null}
  </div></AppShell></PlanFeatureGate>;
}
