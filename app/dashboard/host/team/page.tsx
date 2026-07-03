"use client";

import { LockKeyhole, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience } from "@/lib/plan-access";

export default function HostTeamPage() {
  const { user } = useCurrentUser();
  const experience = getPlanExperience({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });

  return (
    <PlanFeatureGate feature="team_management" requiredPlan="Host" title="Host team tools require Host plan">
      <AppShell>
        <PageTitle title="Team Members" subtitle={`Your ${experience.badgeLabel} workspace supports a foundation for up to ${experience.teamMemberLimit} team members.`} />
        <Card className="mt-8 p-8 text-center">
          <UsersRound className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h2 className="mt-5 text-2xl font-black">Team workspace foundation</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">Roles, invitations, multi-admin permissions, and account recovery controls must be completed before team invitations are activated.</p>
          <div className="mx-auto mt-6 flex max-w-xl items-start gap-3 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-left text-sm text-slate-300">
            <LockKeyhole className="mt-0.5 shrink-0 text-[var(--gold)]" size={18} />
            No invitation has been sent and no additional account access has been granted.
          </div>
          <LinkButton href="/dashboard/host" variant="secondary" className="mt-6">Back to Host Controls</LinkButton>
        </Card>
      </AppShell>
    </PlanFeatureGate>
  );
}
