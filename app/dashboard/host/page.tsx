"use client";

import { BarChart3, Download, Radio, ShieldCheck, Swords, UsersRound, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getPlanExperience } from "@/lib/plan-access";

const controls = [
  { title: "Participant Management", body: "Registration, participant status, and approval foundations.", icon: UsersRound },
  { title: "Submission Review", body: "Submission approval and rejection controls are prepared for a later moderation workflow.", icon: ShieldCheck },
  { title: "Voting Control", body: "Voting-window, visibility, and review foundations without winner payout execution.", icon: Vote },
  { title: "Tournament Builder", body: "Tournament and bracket creation is available as a draft foundation while full execution remains staged.", icon: Swords },
  { title: "Live Event Tools", body: "Event planning and registration foundations. Ticket money movement is not active.", icon: Radio },
  { title: "Reports & Export", body: "Operational reporting and data-export foundations for Host and Enterprise teams.", icon: Download }
];

export default function HostControlCenterPage() {
  const { user } = useCurrentUser();
  const experience = getPlanExperience({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });

  return (
    <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools require Host plan">
      <AppShell>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <PageTitle title={experience.dashboardName} subtitle="Operate competitions through review-safe controls. Money movement and payout execution remain inactive." />
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/challenges/create">Build Competition</LinkButton>
            <LinkButton href="/dashboard/host/team" variant="secondary">Team Members</LinkButton>
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Metric title="Team Capacity" value={String(experience.teamMemberLimit)} label="Invitation workflow not active yet" />
          <Metric title="Monthly Boosts" value={String(experience.monthlyBoostLimit)} label="Internal promotional allowance" />
          <Metric title="Vote Multiplier Limit" value={`${experience.voteMultiplierLimit}x`} label="Applied only where challenge rules allow" />
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {controls.map(({ title, body, icon: Icon }) => (
            <Card key={title} className="p-6">
              <Icon className="text-[var(--gold)]" />
              <h2 className="mt-4 text-xl font-black">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-6">
          <h2 className="flex items-center gap-2 text-xl font-black"><BarChart3 className="text-[var(--gold)]" /> Revenue Overview</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Read-only review foundation only. Withdrawals, automatic payouts, refunds, sponsor release, and paid-entry prize-pool release are not active.</p>
        </Card>
      </AppShell>
    </PlanFeatureGate>
  );
}

function Metric({ title, value, label }: { title: string; value: string; label: string }) {
  return <Card className="p-6"><p className="text-sm font-bold text-slate-400">{title}</p><p className="mt-2 text-3xl font-black text-[var(--gold-2)]">{value}</p><p className="mt-1 text-sm text-slate-300">{label}</p></Card>;
}
