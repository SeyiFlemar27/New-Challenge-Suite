"use client";

import { AppShell } from "@/components/app-shell";
import { Button, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { Target } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier } from "@/lib/plan-access";

export default function MyChallengesPage() {
  const { user } = useCurrentUser();
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const competitor = tier.id === "free_competitor";
  return (
    <AppShell>
      <PageTitle title={competitor ? "Creator tools" : "My Challenges"} subtitle={competitor ? "Launch your own challenges, manage submissions, and grow a competition community." : "Track your active, draft, and completed challenges."} />
      {!competitor ? <div className="mt-8 flex w-full max-w-md rounded-[8px] bg-[#11151d] p-2">{["All Challenges", "Active", "Completed"].map((tab, index) => <Button key={tab} variant={index === 0 ? "primary" : "ghost"} className="min-w-0 flex-1">{tab}</Button>)}</div> : null}
      <EmptyState icon={<Target className="text-[var(--gold)]" />} title={competitor ? "Become a Creator" : "No challenges found"} body={competitor ? "Creator Plan lets you launch challenges and manage incoming submissions." : "Create your first challenge to begin managing your competition workspace."} action={competitor ? <LinkButton href="/subscriptions">Upgrade to Creator</LinkButton> : <LinkButton href="/challenges/create">Create Challenge</LinkButton>} />
    </AppShell>
  );
}
