"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ClipboardCheck, Rocket, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import type { PlanFeature } from "@/lib/plan-access";
import { fetchDashboard } from "@/lib/api/services";

const tools = {
  submissions: {
    title: "Creator Submissions",
    subtitle: "Review entries connected to challenges you own.",
    icon: ClipboardCheck,
    feature: "creator_analytics" as PlanFeature,
    emptyTitle: "No creator submissions yet",
    emptyBody: "Entries will appear after participants join one of your published challenges.",
    actionLabel: "View My Challenges",
    actionHref: "/my-challenges"
  },
  analytics: {
    title: "Creator Analytics",
    subtitle: "Understand challenge activity, submissions, participation, and audience growth.",
    icon: BarChart3,
    feature: "creator_analytics" as PlanFeature,
    emptyTitle: "Analytics will grow with your challenges",
    emptyBody: "Publish a challenge and collect participation before creator performance summaries become available.",
    actionLabel: "Create Challenge",
    actionHref: "/challenges/create"
  },
  boosts: {
    title: "Monthly Boosts",
    subtitle: "Apply your Creator Plan allowance to an eligible challenge.",
    icon: Rocket,
    feature: "boosts" as PlanFeature,
    emptyTitle: "No challenge selected for a boost",
    emptyBody: "Open one of your challenges to review boost eligibility and the remaining monthly allowance.",
    actionLabel: "View My Challenges",
    actionHref: "/my-challenges"
  },
  "sponsor-ready": {
    title: "Sponsor-Ready Challenges",
    subtitle: "Prepare eligible challenges for future sponsor interest without entering the Brand dashboard.",
    icon: ShieldCheck,
    feature: "sponsor_challenges" as PlanFeature,
    emptyTitle: "No sponsor-ready challenges yet",
    emptyBody: "Enable sponsor readiness on an eligible Creator challenge. Funding and money release remain inactive.",
    actionLabel: "Create Challenge",
    actionHref: "/challenges/create"
  }
} as const;

export default function CreatorToolPage() {
  const params = useParams<{ tool: string }>();
  const tool = String(params.tool || "analytics") as keyof typeof tools;
  const config = tools[tool] ?? tools.analytics;
  const Icon = config.icon;

  if (tool === "sponsor-ready") return <SponsorReadyChallenges />;

  return (
    <PlanFeatureGate feature={config.feature} requiredPlan="Creator" title={`${config.title} requires Creator Plan`}>
      <AppShell>
        <div className="mx-auto max-w-6xl">
          <PageTitle title={config.title} subtitle={config.subtitle} icon={<Icon />} />
          <Card className="mt-8">
            <EmptyState
              icon={<Icon />}
              title={config.emptyTitle}
              body={config.emptyBody}
              action={<LinkButton href={config.actionHref}>{config.actionLabel}</LinkButton>}
            />
          </Card>
          <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-5 text-sm leading-6 text-slate-300">
            This is a production-safe workspace foundation. It does not activate payouts, withdrawals, sponsor money release, or automatic financial fulfillment.
          </Card>
        </div>
      </AppShell>
    </PlanFeatureGate>
  );
}

function SponsorReadyChallenges() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "sponsor-ready"], queryFn: fetchDashboard, staleTime: 30_000 });
  const records = data?.ok ? (data.data?.hostedChallenges ?? []) as Array<Record<string, unknown>> : [];
  const eligibleStatuses = new Set(["published", "scheduled"]);
  const challenges = records.filter((challenge) => {
    const monetization = challenge.monetization && typeof challenge.monetization === "object" ? challenge.monetization as Record<string, unknown> : {};
    const sponsorReady = Boolean(challenge.sponsorReady || challenge.sponsorEnabled || monetization.sponsorReady);
    const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
    return sponsorReady && eligibleStatuses.has(status);
  });

  return <PlanFeatureGate feature="sponsor_challenges" requiredPlan="Creator" title="Sponsor-Ready Challenges requires Creator Plan">
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><PageTitle title="Sponsor-Ready Challenges" subtitle="Published and scheduled challenges you own that are enabled for sponsor discovery." /><div className="flex flex-wrap gap-3"><LinkButton href="/challenges" variant="secondary">Enable on Existing Challenge</LinkButton><LinkButton href="/challenges/create">Create New Challenge</LinkButton></div></div>
        {isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-2">{[0, 1].map((item) => <Card key={item} className="h-44 animate-pulse" />)}</div> : challenges.length ? <div className="mt-8 grid gap-5 md:grid-cols-2">{challenges.map((challenge) => <Card key={String(challenge.id)} className="p-6"><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">{String(challenge.status).replaceAll("_", " ")}</p><h2 className="mt-3 text-xl font-black">{String(challenge.title ?? "Untitled challenge")}</h2><p className="mt-2 text-sm text-slate-400">Sponsor discovery is enabled for this owned challenge.</p><LinkButton href={"/challenges/" + String(challenge.id) + "/manage"} variant="secondary" className="mt-5">Manage Challenge</LinkButton></Card>)}</div> : <Card className="mt-8"><EmptyState icon={null} title="No Sponsor-Ready Challenges Yet" body="Enable sponsorship on an eligible owned challenge, then publish or schedule it before it appears here." action={<div className="flex flex-wrap justify-center gap-3"><LinkButton href="/challenges" variant="secondary">Enable on Existing Challenge</LinkButton><LinkButton href="/challenges/create">Create New Challenge</LinkButton></div>} /></Card>}
      </div>
    </AppShell>
  </PlanFeatureGate>;
}
