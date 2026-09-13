"use client";

import { LockKeyhole, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience } from "@/lib/plan-access";

export default function HostTeamPage() {
  const { user } = useCurrentUser();
  const experience = getPlanExperience({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });

  return (
    <PlanFeatureGate feature="team_management" requiredPlan="Host" title="Host team tools require Host plan">
      <AppShell>
        <PageTitle title="Team Members" subtitle={`Your Host workspace supports up to ${experience.teamMemberLimit} team seats.`} />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="p-5"><p className="text-sm text-slate-400">Seats used</p><p className="mt-2 text-3xl font-black">1/{experience.teamMemberLimit}</p></Card>
          <Card className="p-5"><p className="text-sm text-slate-400">Active members</p><p className="mt-2 text-3xl font-black">1</p></Card>
          <Card className="p-5"><p className="text-sm text-slate-400">Pending invitations</p><p className="mt-2 text-3xl font-black">0</p></Card>
        </div>
        <Card className="mt-6 p-8 text-center">
          <UsersRound className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h2 className="mt-5 text-2xl font-black">Team workspace foundation</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">Owner, Manager, Reviewer, Voting Moderator, and Event Staff roles are planned. Permission and recovery controls must be completed before invitations are activated.</p>
          <div className="mx-auto mt-6 flex max-w-xl items-start gap-3 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-left text-sm text-slate-300">
            <LockKeyhole className="mt-0.5 shrink-0 text-[var(--gold)]" size={18} />
            Team invitations are being prepared. No additional account access has been granted yet.
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><LinkButton href="/dashboard/host" variant="secondary">Back to Host Controls</LinkButton></div>
        </Card>
      </AppShell>
    </PlanFeatureGate>
  );
}
