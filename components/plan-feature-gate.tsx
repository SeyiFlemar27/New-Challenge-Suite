"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessPlanFeature, getEffectiveTier, getPlanExperience, type PlanFeature } from "@/lib/plan-access";

export function PlanFeatureGate({
  feature,
  requiredPlan,
  title,
  allowPendingPreview = false,
  children
}: {
  feature: PlanFeature;
  requiredPlan: string;
  title: string;
  allowPendingPreview?: boolean;
  children: React.ReactNode;
}) {
  const { user, loading, signedOut, error } = useCurrentUser();
  const profile = { planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role };
  const experience = getPlanExperience(profile);
  const tier = getEffectiveTier(profile);

  if (loading) {
    return <AppShell><Card className="mx-auto mt-14 h-72 max-w-3xl animate-pulse bg-[#151515]" /></AppShell>;
  }
  if (signedOut || error) {
    return (
      <AppShell>
        <Card className="mx-auto mt-14 max-w-2xl p-8 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h1 className="mt-5 text-3xl font-black">Sign in required</h1>
          <p className="mt-3 text-slate-300">{error || "Sign in to verify your plan access."}</p>
          <LinkButton href="/auth/login" className="mt-6">Sign In</LinkButton>
        </Card>
      </AppShell>
    );
  }
  if (user?.accountType === "sponsor") {
    return (
      <AppShell>
        <Card className="mx-auto mt-14 max-w-2xl p-8 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h1 className="mt-5 text-3xl font-black">Use Brand Command Center</h1>
          <p className="mt-3 text-slate-300">Sponsor accounts use a separate campaign and brand experience.</p>
          <LinkButton href="/sponsor/dashboard" className="mt-6">Open Brand Command Center</LinkButton>
        </Card>
      </AppShell>
    );
  }
  if (!canAccessPlanFeature(profile, feature)) {
    if (allowPendingPreview) return <>{children}</>;
    return (
      <AppShell>
        <Card className="mx-auto mt-14 max-w-2xl border-yellow-500/30 p-8 text-center">
          <LockKeyhole className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{experience.dashboardName}</p>
          <h1 className="mt-2 text-3xl font-black">{title}</h1>
          <p className="mt-3 text-slate-300">{requiredPlan === "Host" ? "Run tournaments, live events, participant reviews, voting controls, and reports." : `${title} requires the ${requiredPlan} plan.`} Your current {tier.displayName} access remains active everywhere else.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton href="/subscriptions">{requiredPlan === "Host" ? "Upgrade to Host" : tier.id === "free_competitor" ? "Upgrade to Creator" : "View Plans"}</LinkButton>
            <LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }
  return <>{children}</>;
}
