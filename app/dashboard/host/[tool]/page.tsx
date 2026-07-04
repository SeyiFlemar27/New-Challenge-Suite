"use client";

import { useParams } from "next/navigation";
import { BarChart3, ClipboardList, ShieldCheck, UsersRound, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";

const tools: Record<string, { title: string; body: string; icon: typeof UsersRound }> = {
  participants: { title: "Participant Management", body: "Participant registration, approval, waitlist, and status controls are prepared as a Host foundation.", icon: UsersRound },
  submissions: { title: "Submission Review", body: "Submission review queues are prepared without automatic winner selection or payout execution.", icon: ShieldCheck },
  voting: { title: "Voting Control", body: "Voting windows, visibility, multipliers, and moderation remain governed by challenge rules and server validation.", icon: Vote },
  reports: { title: "Reports & Results", body: "Competition reports and export foundations are available. Final financial settlement remains inactive.", icon: BarChart3 },
  revenue: { title: "Revenue Overview", body: "Entry, vote, sponsor, and payout-review records are read-only. No balance is withdrawable.", icon: BarChart3 },
  sponsors: { title: "Sponsor Requests", body: "Sponsor-interest records appear only for sponsor-ready competitions. Money capture and release remain inactive.", icon: ClipboardList }
  , events: { title: "Live Event Management", body: "Event status, registrations, check-ins, and operational controls remain review-safe foundations.", icon: ClipboardList }
};

export default function HostToolPage() {
  const params = useParams<{ tool: string }>();
  const tool = tools[params.tool] ?? tools.participants;
  const Icon = tool.icon;
  return (
    <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan">
      <AppShell>
        <PageTitle title={tool.title} subtitle={tool.body} />
        <Card className="mt-8 p-8 text-center">
          <Icon className="mx-auto h-12 w-12 text-[var(--gold)]" />
          <h2 className="mt-5 text-2xl font-black">Operational foundation</h2>
          <p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-300">This destination is intentionally available so Host navigation is complete. Its write workflow remains staged until moderation, audit, and permission controls are finalized.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><LinkButton href="/dashboard/host">Back to Host Control Center</LinkButton><Button variant="secondary" disabled>Actions Coming Soon</Button></div>
        </Card>
      </AppShell>
    </PlanFeatureGate>
  );
}
