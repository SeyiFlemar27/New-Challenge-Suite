"use client";

import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { Target } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

export default function MyChallengesPage() {
  const { user, loading } = useCurrentUser();
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const freeUser = tier.id === "free_competitor" || tier.id === "creator_starter" || tier.id === "host_starter";
  if (loading) {
    return <AppShell><div className="mx-auto max-w-5xl"><div className="h-12 w-80 max-w-full animate-pulse rounded bg-white/10" /><div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-36 animate-pulse bg-[#151515]" />)}</div><Card className="mt-8 h-80 animate-pulse bg-[#151515]" /></div></AppShell>;
  }
  return (
    <AppShell>
      <PageTitle title="My Challenges" subtitle={freeUser ? "Create and track your Free Basic Challenges. Free accounts can publish up to three lifetime public, non-monetized challenges." : "Track your active, draft, and completed challenges."} />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Create</p><p className="mt-2 text-xl font-black">Basic Challenge Builder</p><p className="mt-2 text-sm text-slate-300">Free users can create public basic challenges. Premium tools stay locked until upgrade.</p><LinkButton href="/challenges/create" className="mt-5 w-full">Create Challenge</LinkButton></Card>
        <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Plan</p><p className="mt-2 text-xl font-black">{tier.displayName}</p><p className="mt-2 text-sm text-slate-300">Private, prize, sponsor, tournament, live event, and analytics tools follow your plan gates.</p><LinkButton href="/subscriptions" variant="secondary" className="mt-5 w-full">View Plans</LinkButton></Card>
        <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Entries</p><p className="mt-2 text-xl font-black">Participation</p><p className="mt-2 text-sm text-slate-300">Your submitted entries remain separate from challenges you create.</p><LinkButton href="/my-entries" variant="secondary" className="mt-5 w-full">My Entries</LinkButton></Card>
      </div>
      <Card className="mt-8"><EmptyState icon={<Target className="text-[var(--gold)]" />} title="No challenges found" body={freeUser ? "Create your first Free Basic Challenge to begin tracking drafts, submissions, and public activity here." : "Create your first challenge to begin managing your competition workspace."} action={<LinkButton href="/challenges/create">Create Challenge</LinkButton>} /></Card>
    </AppShell>
  );
}
