"use client";

import { useParams } from "next/navigation";
import { BarChart3, ClipboardCheck, Rocket, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import type { PlanFeature } from "@/lib/plan-access";

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
