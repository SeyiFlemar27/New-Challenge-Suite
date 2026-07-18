"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, ClipboardList, Download, Radio, ShieldCheck, Swords, UsersRound, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard, fetchLiveEvents } from "@/lib/api/services";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getEffectiveTier, getPlanExperience } from "@/lib/plan-access";

const modules = [
  { title: "Participant Management", body: "Review registration and participant status.", icon: UsersRound, href: "/host/participants" },
  { title: "Submission Review", body: "Review pending competition submissions without automatic winner selection.", icon: ShieldCheck, href: "/host/submissions" },
  { title: "Voting Control", body: "Monitor voting windows, visibility, and review states.", icon: Vote, href: "/host/voting" },
  { title: "Tournament Builder", body: "Plan tournament structures and rounds.", icon: Swords, href: "/host/tournaments" },
  { title: "Live Event Tools", body: "Manage live events, registration, and event status.", icon: Radio, href: "/host/live-events" },
  { title: "Reports & Export", body: "Review operational report readiness.", icon: Download, href: "/host/reports" },
  { title: "Team Members", body: "Review host team access.", icon: UsersRound, href: "/host/team" },
  { title: "Revenue Overview", body: "Read-only entry, vote, sponsor, and payout review status.", icon: BarChart3, href: "/dashboard/host/revenue" },
  { title: "Sponsor Requests", body: "Review sponsor-interest setup for sponsor-ready competitions.", icon: ClipboardList, href: "/dashboard/host/sponsors" }
];

export default function HostControlCenterPage() {
  const { user } = useCurrentUser();
  const dashboardQuery = useQuery({ queryKey: ["dashboard", "host"], queryFn: fetchDashboard, staleTime: 30_000 });
  const eventsQuery = useQuery({ queryKey: ["live-events", "host"], queryFn: () => fetchLiveEvents(30), staleTime: 30_000 });
  const experience = getPlanExperience({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });
  const tier = getEffectiveTier({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType, selectedAccountType: user?.selectedAccountType, role: user?.role });
  const dashboard = dashboardQuery.data?.ok ? dashboardQuery.data.data : null;
  const events = eventsQuery.data?.ok ? (eventsQuery.data.data?.events ?? []).filter((item) => Boolean((item as Record<string, unknown>).isOwned)) : [];
  const submissions = dashboard?.submissions ?? [];
  const challenges: unknown[] = dashboard?.hostedChallenges ?? [];
  const pendingSubmissions = submissions.filter((item) => ["submitted", "pending_review"].includes(String((item as Record<string, unknown>).status ?? ""))).length;
  const upcomingEvents = events.filter((item) => ["scheduled", "approved", "upcoming"].includes(String((item as Record<string, unknown>).status ?? "scheduled"))).length;
  const totalVotes = challenges.reduce<number>((sum, item) => sum + Number((item as Record<string, unknown>).voteCount ?? 0), 0);

  return (
    <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan">
      <AppShell>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{tier.id === "host" ? "Host Plan / Host" : experience.badgeLabel}</p>
        <div className="mt-2 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <PageTitle title="Host Control Center" subtitle="Run competitions, manage participants, control voting, review submissions, and monitor event performance." />
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/challenges/create">Create Challenge</LinkButton>
            <LinkButton href="/host/live/create" variant="secondary">Create Live Event</LinkButton>
            <LinkButton href="/host/submissions" variant="secondary">Review Submissions</LinkButton>
            <LinkButton href="/host/voting" variant="secondary">Voting Control</LinkButton>
            <LinkButton href="/host/reports" variant="secondary">Reports</LinkButton>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric title="Active Competitions" value={challenges.length} />
          <Metric title="Upcoming Events" value={upcomingEvents} />
          <Metric title="Pending Participants" value={0} note="Awaiting activity" />
          <Metric title="Pending Submissions" value={pendingSubmissions} />
          <Metric title="Live Voting Sessions" value={0} note="Setup required" />
          <Metric title="Total Votes" value={totalVotes} />
          <Metric title="Reports Ready" value={0} note="Setup required" />
          <Metric title="Team Seats" value={`1/${experience.teamMemberLimit}`} />
          <Metric title="Revenue Review" value="Review only" note="No money movement" />
        </div>

        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="text-2xl font-black">Host Setup Checklist</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Checklist label="Host plan activated" done={tier.id === "host"} href="/settings/billing" />
            <Checklist label="Complete host workspace" done={Boolean(user?.hostOnboardingComplete)} href="/onboarding/host" />
            <Checklist label="Set competition preferences" href="/settings/preferences" />
            <Checklist label="Create first competition" done={challenges.length > 0} href="/challenges/create" />
            <Checklist label="Configure voting rules" href="/host/voting" />
            <Checklist label="Invite team member" href="/host/team" />
            <Checklist label="Publish first event" done={events.length > 0} href="/host/live-events" />
            <Checklist label="Review reports" href="/host/reports" />
          </div>
        </Card>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <Card className="p-6"><h2 className="text-xl font-black">Active Hosted Competitions</h2><div className="mt-4 space-y-3">{challenges.length ? challenges.slice(0, 4).map((item) => { const record = item as Record<string, unknown>; return <div key={String(record.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-black/30 p-4"><span className="font-bold">{String(record.title ?? "Hosted competition")}</span><LinkButton href={`/challenges/${String(record.id)}`} variant="ghost">Manage Competition</LinkButton></div>; }) : <p className="text-sm text-slate-400">No hosted competitions yet.</p>}</div></Card>
          <Card className="p-6"><h2 className="text-xl font-black">Upcoming Events</h2><div className="mt-4 space-y-3">{events.length ? events.slice(0, 4).map((item) => { const record = item as Record<string, unknown>; return <div key={String(record.id)} className="rounded-[8px] bg-black/30 p-4"><p className="font-bold">{String(record.title ?? "Live event")}</p><p className="mt-1 text-sm text-slate-400">{String(record.location ?? "Location pending")} - {String(record.status ?? "scheduled").replaceAll("_", " ")}</p></div>; }) : <p className="text-sm text-slate-400">No upcoming events yet.</p>}</div></Card>
          <Card className="p-6"><h2 className="text-xl font-black">Pending Reviews</h2><p className="mt-3 text-sm leading-6 text-slate-300">{pendingSubmissions} pending submission{pendingSubmissions === 1 ? "" : "s"}. Participant review, moderation, and manual winner confirmation remain controlled by the host.</p><LinkButton href="/host/submissions" variant="secondary" className="mt-5">Review Submissions</LinkButton></Card>
          <Card className="p-6"><h2 className="text-xl font-black">Recent Host Activity</h2><p className="mt-3 text-sm leading-6 text-slate-300">Voting activity, participant changes, reports, and sponsor requests will appear here when real host activity is recorded.</p><LinkButton href="/host/reports" variant="secondary" className="mt-5">Reports & Results</LinkButton></Card>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ title, body, icon: Icon, href }) => (
            <Card key={title} className="flex min-h-56 flex-col p-6">
              <Icon className="text-[var(--gold)]" />
              <h2 className="mt-4 text-xl font-black">{title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-300">{body}</p>
              <LinkButton href={href} variant="secondary" className="mt-5 w-full">Open {title}</LinkButton>
            </Card>
          ))}
        </div>
        <Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-6"><h2 className="font-black">Revenue safety</h2><p className="mt-2 text-sm leading-6 text-slate-300">Revenue and sponsor money movement remain unavailable from this dashboard. Withdrawals, payouts, refunds, sponsor releases, and paid-entry prize-pool releases are not active.</p></Card>
      </AppShell>
    </PlanFeatureGate>
  );
}

function Metric({ title, value, note }: { title: string; value: string | number; note?: string }) {
  return <Card className="p-5"><p className="text-sm font-bold text-slate-400">{title}</p><p className="mt-2 text-3xl font-black text-[var(--gold-2)]">{value}</p>{note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}</Card>;
}

function Checklist({ label, done = false, href }: { label: string; done?: boolean; href: string }) {
  return <LinkButton href={href} variant="ghost" className="min-h-14 justify-start border border-white/10"><CheckCircle2 className={done ? "text-emerald-400" : "text-slate-500"} size={18} /> {label}</LinkButton>;
}
