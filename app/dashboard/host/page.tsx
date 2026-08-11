"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardCheck, Rocket, Trophy, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PlanFeatureGate } from "@/components/plan-feature-gate";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { fetchDashboard } from "@/lib/api/services";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";
import { getChallengePhaseSummary } from "@/lib/challenge-status";
import { getUserPlanAccess } from "@/lib/plan-access";

type RecordRow = Record<string, unknown>;
type CompetitionTab = "active" | "upcoming" | "drafts" | "completed";

const tabs: Array<{ id: CompetitionTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "upcoming", label: "Upcoming" },
  { id: "drafts", label: "Drafts" },
  { id: "completed", label: "Completed" }
];

function normalizedStatus(challenge: RecordRow) {
  return String(challenge.managementState ?? challenge.status ?? challenge.lifecycleStatus ?? "draft").toLowerCase();
}

function competitionTab(challenge: RecordRow): CompetitionTab {
  const status = normalizedStatus(challenge);
  if (status === "draft" || status === "requires_changes") return "drafts";
  if (["completed", "winners_announced", "voting_closed"].includes(status)) return "completed";
  if (["scheduled", "approved", "pending_review"].includes(status)) return "upcoming";
  return "active";
}

function participantCount(challenge: RecordRow) {
  return Number(challenge.participantCount ?? challenge.participants ?? 0) || 0;
}

function pendingReviewCount(challenge: RecordRow) {
  const explicit = Number(challenge.pendingSubmissionCount ?? 0)
    + Number(challenge.pendingEntryRequestCount ?? 0)
    + Number(challenge.pendingReportCount ?? 0)
    + Number(challenge.pendingSponsorRequestCount ?? 0);
  return explicit + (normalizedStatus(challenge) === "pending_review" ? 1 : 0);
}

function nextDeadline(challenge: RecordRow) {
  const candidates = [
    challenge.registrationDeadline,
    challenge.registrationEndAt,
    challenge.submissionStartAt,
    challenge.startsAt,
    challenge.submissionDeadline,
    challenge.votingDeadline,
    challenge.votingEndsAt,
    challenge.winnerAnnouncementAt,
    challenge.endsAt
  ].map((value) => ({ value, time: Date.parse(String(value ?? "")) }))
    .filter((item) => Number.isFinite(item.time) && item.time > Date.now())
    .sort((left, right) => left.time - right.time);
  return candidates[0]?.value ?? null;
}

export default function HostControlCenterPage() {
  const { user } = useCurrentUser();
  const searchParams = useSearchParams();
  const hostPlan = getUserPlanAccess({ planId: user?.planId, planStatus: user?.planStatus, accountType: user?.accountType });
  const pendingCheckoutReturn = searchParams.get("checkout") === "success" && searchParams.get("activation") === "pending" && !hostPlan.isHost;
  const [activationHelp, setActivationHelp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activationMessage, setActivationMessage] = useState("Your Host membership is still being activated. Please try again shortly.");
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "host"], queryFn: fetchDashboard, staleTime: 30_000 });
  const [activeTab, setActiveTab] = useState<CompetitionTab>("active");
  const dashboard = data?.ok ? data.data : null;
  const challenges = useMemo<RecordRow[]>(() => (dashboard?.hostedChallenges ?? []) as RecordRow[], [dashboard]);
  const notifications = useMemo<RecordRow[]>(() => (dashboard?.notifications ?? []) as RecordRow[], [dashboard]);
  const tabbed = useMemo(() => challenges.filter((challenge) => competitionTab(challenge) === activeTab), [activeTab, challenges]);
  const activeChallenges = challenges.filter((challenge) => competitionTab(challenge) === "active");
  const totalParticipants = challenges.reduce((sum, challenge) => sum + participantCount(challenge), 0);
  const pendingReviews = challenges.reduce((sum, challenge) => sum + pendingReviewCount(challenge), 0);
  const deadlines = challenges.map((challenge) => ({ challenge, deadline: nextDeadline(challenge) })).filter((item) => item.deadline);
  const attention = challenges.flatMap((challenge) => {
    const count = pendingReviewCount(challenge);
    if (!count) return [];
    return [{
      id: String(challenge.id),
      title: String(challenge.title ?? "Competition"),
      count,
      href: `/challenges/${String(challenge.id)}/manage`
    }];
  });
  const setupSteps = [
    { label: "Complete host workspace", done: Boolean(user?.hostOnboardingComplete), href: "/onboarding/host" },
    { label: "Create first competition", done: challenges.length > 0, href: "/challenges" }
  ];
  const remainingSetup = setupSteps.filter((step) => !step.done);
  const activity = notifications.filter((item) => {
    const targetId = String(item.targetId ?? item.challengeId ?? "");
    return targetId && challenges.some((challenge) => String(challenge.id) === targetId);
  }).slice(0, 5);

  async function refreshHostStatus() {
    setRefreshing(true);
    try {
      const query = new URLSearchParams({ purpose: "subscription", resourceId: "host", verify: "1" });
      const reference = searchParams.get("session_id");
      if (reference && /^cs_[A-Za-z0-9_]+$/.test(reference)) query.set("reference", reference);
      const response = await fetch(`/api/payments/status?${query.toString()}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => null) as { data?: { state?: string } } | null;
      if (response.ok && body?.data?.state === "confirmed") {
        window.location.assign("/dashboard/host");
        return;
      }
      setActivationMessage("Your Host membership is still being activated. Please try again shortly.");
    } catch {
      setActivationMessage("Host membership status could not be refreshed. Please try again or contact support.");
    } finally {
      setRefreshing(false);
    }
  }

  function hostAction(label: string, href: string, variant: "primary" | "secondary" | "ghost" = "primary", className = "") {
    if (!pendingCheckoutReturn) return <LinkButton href={href} variant={variant} className={className}>{label}</LinkButton>;
    return <Button type="button" variant={variant} className={className} onClick={() => setActivationHelp(true)}>{label}</Button>;
  }

  return (
    <PlanFeatureGate feature="host_control_center" requiredPlan="Host" title="Host tools are available on the Host Plan" allowPendingPreview={pendingCheckoutReturn}>
      <AppShell>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <PageTitle title="Host Control Center" subtitle="See what is active, what needs attention, and what is coming next." />
          {hostAction("Create Competition", "/challenges/create", "primary", "w-full sm:w-auto")}
        </div>

        {activationHelp ? <Card className="mt-6 border-amber-300/40 bg-amber-50 p-4 text-slate-950 sm:p-5" role="status">
          <p className="font-black">{activationMessage}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={refreshing} onClick={() => void refreshHostStatus()}>{refreshing ? "Refreshing..." : "Refresh Status"}</Button>
            <LinkButton href="/subscriptions" variant="secondary">Billing</LinkButton>
            <LinkButton href="/contact" variant="secondary">Contact Support</LinkButton>
          </div>
        </Card> : null}

        {remainingSetup.length ? <Card className="mt-6 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-black">Complete your Host setup</p><p className="mt-1 text-sm text-slate-400">{remainingSetup.length} step{remainingSetup.length === 1 ? "" : "s"} remaining</p></div>
            <div className="flex flex-wrap gap-2">{remainingSetup.map((step) => <span key={step.label}>{hostAction(step.label, step.href, "secondary")}</span>)}</div>
          </div>
        </Card> : null}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Active Competitions" value={activeChallenges.length} icon={<Trophy />} />
          <Metric title="Total Participants" value={totalParticipants} icon={<UsersRound />} />
          <Metric title="Pending Reviews" value={pendingReviews} icon={<ClipboardCheck />} />
          <Metric title="Upcoming Deadlines" value={deadlines.length} icon={<CalendarClock />} />
        </div>

        <Card className="mt-7 border-yellow-400/30 bg-yellow-50 p-5 text-slate-950 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><span className="rounded-[8px] bg-yellow-200 p-2 text-yellow-950"><Rocket size={20} /></span><div><h2 className="font-black">Monthly challenge boosts</h2><p className="mt-1 text-sm text-slate-600">{pendingCheckoutReturn ? "Host boosts unlock only after your membership is confirmed by the server." : `Your Host plan includes ${hostPlan.monthlyBoostLimit} boosts each month. Usage and remaining allocation come from recorded boost activity.`}</p></div></div>
            {hostAction("Manage boosts", "/creator/boosts")}
          </div>
        </Card>

        {attention.length ? <Card className="mt-7 p-5 sm:p-6">
          <div className="flex items-center gap-3"><AlertCircle className="text-[var(--gold)]" /><h2 className="text-xl font-black">Needs Attention</h2></div>
          <div className="mt-4 divide-y divide-white/10">{attention.map((item) => <div key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{item.title}</p><p className="mt-1 text-sm text-slate-400">{item.count} review item{item.count === 1 ? "" : "s"} awaiting action</p></div>{hostAction("Review", item.href, "secondary")}</div>)}</div>
        </Card> : null}

        <Card className="mt-7 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-black">Your Competitions</h2><LinkButton href="/challenges" variant="ghost">View all</LinkButton></div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Competition status">
            {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`min-h-11 shrink-0 rounded-[8px] px-4 text-sm font-black ${activeTab === tab.id ? "bg-[var(--gold)] text-black" : "bg-white/5 text-slate-300"}`}>{tab.label}</button>)}
          </div>
          {isLoading ? <div className="mt-5 h-32 animate-pulse rounded-[8px] bg-white/5" /> : tabbed.length ? <div className="mt-5 divide-y divide-white/10">{tabbed.slice(0, 8).map((challenge) => {
            const id = String(challenge.id);
            const phase = getChallengePhaseSummary(challenge);
            const deadline = nextDeadline(challenge);
            return <div key={id} className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_120px_160px_210px_auto] lg:items-center">
              <div className="min-w-0"><p className="truncate font-black">{String(challenge.title ?? "Untitled competition")}</p><p className="mt-1 text-xs uppercase text-slate-500">{normalizedStatus(challenge).replaceAll("_", " ")}</p></div>
              <p className="text-sm text-slate-300">{participantCount(challenge)} participants</p>
              <p className="text-sm capitalize text-slate-300">{phase.phase.replaceAll("_", " ")}</p>
              <p className="text-sm text-slate-400">{deadline ? formatChallengeDateTime(deadline, challenge) : "No upcoming deadline"}</p>
              {hostAction("Manage", `/challenges/${id}/manage`, "secondary")}
            </div>;
          })}</div> : <p className="mt-5 rounded-[8px] bg-black/20 p-5 text-sm text-slate-400">No {tabs.find((tab) => tab.id === activeTab)?.label.toLowerCase()} competitions.</p>}
        </Card>

        {activity.length ? <Card className="mt-7 p-5 sm:p-6">
          <h2 className="text-xl font-black">Recent Activity</h2>
          <div className="mt-4 divide-y divide-white/10">{activity.map((item) => <div key={String(item.id)} className="flex gap-3 py-3 first:pt-0 last:pb-0"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={18} /><div><p className="font-bold">{String(item.title ?? "Competition update")}</p><p className="mt-1 text-sm text-slate-400">{String(item.body ?? item.message ?? "")}</p></div></div>)}</div>
        </Card> : null}
      </AppShell>
    </PlanFeatureGate>
  );
}

function Metric({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return <Card className="p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-400">{title}</p><span className="text-[var(--gold)]">{icon}</span></div><p className="mt-3 text-3xl font-black text-white">{value.toLocaleString()}</p></Card>;
}
