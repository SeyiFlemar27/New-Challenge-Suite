"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { ChallengeCard } from "@/components/domain-cards";
import { Activity, Award, BarChart3, ClipboardCheck, Crown, Diamond, Gift, LockKeyhole, Medal, Radio, Rocket, Settings, ShieldCheck, Swords, Trophy, User, UsersRound, Vote } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { findCustomizationOption } from "@/lib/customization/options";
import { cn } from "@/lib/utils";
import { getEffectiveTier, getPlanExperience } from "@/lib/plan-access";


type BadgeRecord = {
  id?: string;
  title?: string;
  name?: string;
};

type DashboardRedirectData = {
  redirectTo?: string;
  user?: {
    accountType?: string;
    sponsorOnboardingComplete?: boolean;
    hasSponsorProfile?: boolean;
  };
};

type DashboardChallenge = ReturnType<typeof normalizeChallenge> & Record<string, unknown>;

function isPrivateCreatorChallenge(challenge: Record<string, unknown>) {
  const visibility = String(challenge.visibility ?? "").toLowerCase();
  const type = String(challenge.type ?? "").toLowerCase();
  return visibility.includes("private") || visibility.includes("exclusive") || type.includes("private") || type.includes("exclusive") || type.includes("invite");
}

function isActiveCreatorChallenge(challenge: Record<string, unknown>) {
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? challenge.computedStatus ?? "").toLowerCase();
  return ["published", "scheduled", "active", "registration_open", "submission_open", "voting_open"].includes(status);
}

function numberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key] ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    staleTime: 30_000
  });

  const dashboard = data?.ok ? data.data : null;
  const redirectTo = (dashboard as DashboardRedirectData | null)?.redirectTo;
  const sponsorAccount = (dashboard as DashboardRedirectData | null)?.user?.accountType === "sponsor";

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  const challenges = useMemo(() => {
    return (dashboard?.challenges ?? []).map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item as ChallengeApiRecord) })).filter((item) => item.id);
  }, [dashboard?.challenges]);
  const hostedChallenges = useMemo<DashboardChallenge[]>(() => {
    return (dashboard?.hostedChallenges ?? []).map((item) => ({ ...(item as Record<string, unknown>), ...normalizeChallenge(item as ChallengeApiRecord) })).filter((item) => item.id);
  }, [dashboard?.hostedChallenges]);
  const badges = (dashboard?.badges ?? []) as BadgeRecord[];
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;
  const firstName = (dashboard?.user.displayName || "there").split(" ")[0] || "there";
  const dashboardStyle = findCustomizationOption(dashboard?.user.customization?.dashboardStyleId, "dashboardStyle")?.previewClass;
  const planExperience = getPlanExperience({
    planId: dashboard?.user.planId,
    planStatus: dashboard?.user.planStatus,
    accountType: dashboard?.user.accountType
  });
  const selectedAccountType = dashboard?.user.selectedAccountType ?? dashboard?.user.role ?? dashboard?.user.accountType;
  const effectiveTier = getEffectiveTier({
    planId: dashboard?.user.planId,
    planStatus: dashboard?.user.planStatus,
    accountType: dashboard?.user.accountType,
    selectedAccountType,
    role: dashboard?.user.role
  });
  useEffect(() => {
    if (isLoading || redirectTo) return;
    if (effectiveTier.id === "host") {
      router.replace(dashboard?.user.hostOnboardingComplete ? "/dashboard/host" : "/onboarding/host");
    } else if (effectiveTier.id === "creator" && !dashboard?.user.creatorOnboardingComplete) {
      router.replace("/onboarding/creator");
    }
  }, [dashboard?.user.creatorOnboardingComplete, dashboard?.user.hostOnboardingComplete, effectiveTier.id, isLoading, redirectTo, router]);
  const freeCompetitor = planExperience.planId === "free" && selectedAccountType !== "creator" && selectedAccountType !== "host";
  const creatorPublicChallenges = hostedChallenges.filter((challenge) => !isPrivateCreatorChallenge(challenge));
  const creatorPrivateChallenges = hostedChallenges.filter((challenge) => isPrivateCreatorChallenge(challenge));
  const creatorActiveChallenges = hostedChallenges.filter((challenge) => isActiveCreatorChallenge(challenge));
  const creatorDrafts = hostedChallenges.filter((challenge) => String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase() === "draft");
  const creatorSubmissions = hostedChallenges.reduce((sum, challenge) => sum + numberField(challenge, ["submissionCount", "submissions"]), 0);
  const creatorVotes = hostedChallenges.reduce((sum, challenge) => sum + numberField(challenge, ["voteCount", "weightedVoteCount", "votes"]), 0);
  const tierFeatures = planExperience.planId === "free"
    ? freeCompetitor ? [
        { title: "Create Basic Challenge", body: "Create up to three lifetime public, non-monetized challenges before upgrading.", icon: Swords, active: true, href: "/challenges/create" },
        { title: "My Challenges", body: "Draft, publish, and track your Free Basic Challenge activity.", icon: Trophy, active: true, href: "/my-challenges" },
        { title: "Explore Challenges", body: "Find public challenges to join, vote in, or follow.", icon: Vote, active: true, href: "/explore" }
      ] : [
        { title: "Basic Public Challenge", body: "Create up to three lifetime public, non-monetized challenges.", icon: Swords, active: true, href: "/challenges/create" },
        { title: "My Challenges & Submissions", body: "Track your public challenges and review the entries they receive.", icon: Trophy, active: true, href: "/my-challenges" }
      ]
    : planExperience.planId === "creator"
      ? [
          { title: "Creator Analytics", body: "Track submissions, challenge activity, and basic creator performance.", icon: BarChart3, active: true, href: "/creator/analytics" },
          { title: "Sponsor Ready", body: "Prepare eligible challenges for future sponsor interest.", icon: Rocket, active: true, href: "/creator/sponsor-ready" },
          { title: "Creator Earnings", body: "View approved earnings status without treating DoroCoin as withdrawable cash.", icon: ShieldCheck, active: true, href: "/wallet" }
        ]
      : planExperience.planId === "pro"
        ? [
            { title: "Performance Analytics", body: "Study ranking history, highlighted submissions, votes, and challenge performance.", icon: Activity, active: true },
            { title: "Ranked Challenges", body: "Create ranked formats and join tournament experiences when available.", icon: Trophy, active: true },
            { title: "Amplification", body: `${planExperience.monthlyBoostLimit} boosts per month and vote multipliers up to ${planExperience.voteMultiplierLimit}x.`, icon: Rocket, active: true }
          ]
        : planExperience.planId === "host"
          ? [
              { title: "Competition Operations", body: "Manage participants, submission review, voting controls, tournaments, and live-event setup.", icon: Radio, active: true, href: "/dashboard/host" },
              { title: "Host Team", body: `Team workspace for up to ${planExperience.teamMemberLimit} members. Invitations require setup before sending.`, icon: UsersRound, active: true, href: "/host/team" },
              { title: "Revenue Overview", body: "Read-only sponsorship and revenue review. Transfers and withdrawals remain inactive.", icon: ShieldCheck, active: true }
            ]
          : [
              { title: "Programs & Campaigns", body: "Coordinate branded programs, campaigns, and large competition workspaces.", icon: Crown, active: true },
              { title: "Reports & Exports", body: "Enterprise reporting and export readiness for program oversight.", icon: BarChart3, active: true },
              { title: "Teams & Integrations", body: `Multi-admin workspace for up to ${planExperience.teamMemberLimit} members, with integrations shown when configured.`, icon: UsersRound, active: true, href: "/dashboard/host" }
            ];
  const quickActions = planExperience.planId === "free"
    ? freeCompetitor ? [
        { href: "/challenges/create", label: "Create Basic Challenge", variant: "primary" as const },
        { href: "/my-challenges", label: "My Challenges", variant: "secondary" as const },
        { href: "/explore", label: "Explore Challenges", variant: "ghost" as const }
      ] : [
        { href: "/challenges/create", label: "Create Basic Challenge", variant: "primary" as const },
        { href: "/my-challenges", label: "My Challenges", variant: "secondary" as const }
      ]
    : planExperience.planId === "creator"
      ? [
          { href: "/challenges/create", label: "Create Challenge", variant: "primary" as const },
          { href: "/creator/challenges", label: "Challenges", variant: "secondary" as const },
          { href: "/creator/private-challenges", label: "Private Challenges", variant: "ghost" as const }
        ]
      : planExperience.planId === "pro"
        ? [
            { href: "/challenges/create", label: "Create Ranked Challenge", variant: "primary" as const },
            { href: "/leaderboards", label: "Performance & Rank", variant: "secondary" as const },
            { href: "/profile", label: "Highlight Profile", variant: "ghost" as const }
          ]
        : [
            { href: "/dashboard/host", label: planExperience.planId === "enterprise" ? "Open Command Center" : "Open Host Controls", variant: "primary" as const },
            { href: "/challenges/create", label: "Build Competition", variant: "secondary" as const },
            { href: "/wallet", label: "Revenue Overview", variant: "ghost" as const }
          ];
  const tierStats = planExperience.planId === "free"
    ? [
        { icon: <Swords />, title: freeCompetitor ? "My Entries" : "Active Challenges", value: freeCompetitor ? dashboard?.stats.submissionCount ?? 0 : dashboard?.stats.activeChallenges ?? 0, label: freeCompetitor ? "Competition submissions" : "Public challenge allowance" },
        { icon: <Diamond />, title: "Points Earned", value: dashboard?.stats.totalPoints ?? 0, label: "Competition score" },
        { icon: <Medal />, title: "Badges Collected", value: dashboard?.stats.badgeCount ?? 0, label: "Achievements" }
      ]
    : planExperience.planId === "creator"
      ? [
          { icon: <Swords />, title: "Public Challenges", value: creatorPublicChallenges.length, label: "Creator-owned public challenges" },
          { icon: <LockKeyhole />, title: "Private Challenges", value: creatorPrivateChallenges.length, label: "Invite-only creator work" },
          { icon: <ClipboardCheck />, title: "Submissions", value: creatorSubmissions, label: "Entries on your challenges" },
          { icon: <Activity />, title: "Active Challenges", value: creatorActiveChallenges.length, label: "Currently running" },
          { icon: <Award />, title: "Drafts", value: creatorDrafts.length, label: "Unpublished setup" },
          { icon: <Vote />, title: "Votes Received", value: creatorVotes, label: "Across creator challenges" }
        ]
      : planExperience.planId === "pro"
        ? [
            { icon: <Trophy />, title: "Performance Points", value: dashboard?.stats.totalPoints ?? 0, label: "Ranking performance" },
            { icon: <Activity />, title: "Submissions", value: dashboard?.stats.submissionCount ?? 0, label: "Portfolio activity" },
            { icon: <Rocket />, title: "Monthly Boosts", value: planExperience.monthlyBoostLimit, label: `${planExperience.voteMultiplierLimit}x vote limit` }
          ]
        : [
            { icon: <Swords />, title: planExperience.planId === "enterprise" ? "Active Programs" : "Active Competitions", value: dashboard?.stats.activeChallenges ?? 0, label: planExperience.challengeLimitLabel },
            { icon: <UsersRound />, title: "Team Capacity", value: planExperience.teamMemberLimit, label: "Team seats" },
            { icon: <BarChart3 />, title: "Reports & Exports", value: planExperience.features.data_export ? "Ready" : "Locked", label: "Operational access" }
          ];

  const creatorTools = [
    { title: "Create Challenge", body: "Start a public creator challenge.", icon: Swords, href: "/challenges/create" },
    { title: "Private Challenges", body: "Manage invite-only challenges and access.", icon: LockKeyhole, href: "/creator/private-challenges" },
    { title: "Review Submissions", body: "Open creator submission review tools.", icon: ClipboardCheck, href: "/creator/submissions" },
    { title: "Draft Challenges", body: "Continue setup from your challenge list.", icon: Award, href: "/creator/challenges" },
    { title: "Voting Status", body: "Check voting readiness from your creator challenges.", icon: Vote, href: "/creator/challenges" },
    { title: "Invite Links", body: "Open private challenge access tools.", icon: ShieldCheck, href: "/creator/private-challenges" },
    { title: "Creator Analytics", body: "View analytics when real activity is available.", icon: BarChart3, href: "/creator/analytics" },
    { title: "Sponsor Readiness", body: "Review sponsor-ready setup states.", icon: Rocket, href: "/creator/sponsor-ready" },
    { title: "Wallet & Rewards", body: "Open wallet and reward tools.", icon: Gift, href: "/wallet" },
    { title: "Creator Profile", body: "Update public profile and settings.", icon: User, href: "/profile" },
    { title: "Settings", body: "Manage creator account preferences.", icon: Settings, href: "/settings" }
  ];
  if (isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Challenge Suite</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Loading your workspace...</h1>
          <div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-32 animate-pulse bg-[#151515]" />)}</div>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-64 animate-pulse bg-[#151515]" />)}</div>
        </div>
      </AppShell>
    );
  }

  if (redirectTo || sponsorAccount) {
    return (
      <AppShell>
        <Card className="mt-12 p-8 text-center">
          <h1 className="text-3xl font-black text-[var(--gold-2)]">Opening Brand Command Center</h1>
          <p className="mt-3 text-slate-300">Sponsor accounts use the dedicated sponsor experience.</p>
          <LinkButton href={redirectTo || "/sponsor/onboarding"} className="mt-6">Continue</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (planExperience.planId === "creator") {
    return (
      <AppShell>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <BrandLogo imageClassName="h-16 w-16 border border-[var(--gold)]" />
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Creator Plan</p>
              <PageTitle title="Creator Studio" subtitle="Run public and private challenges from one creator workspace." />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            {quickActions.map((action) => <LinkButton key={action.href} href={action.href} variant={action.variant}>{action.label}</LinkButton>)}
          </div>
        </div>

        {errorMessage ? (
          <Card className="mt-8 p-6 md:p-8">
            <h2 className="text-2xl font-black text-[var(--gold-2)]">Creator Studio could not load</h2>
            <p className="mt-3 text-slate-300">{errorMessage}</p>
          </Card>
        ) : null}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {tierStats.map((stat) => <Stat key={stat.title} className={dashboardStyle} icon={stat.icon} title={stat.title} value={String(stat.value)} label={stat.label} />)}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {creatorTools.map((tool) => <CreatorToolCard key={tool.title} {...tool} />)}
        </div>

        <Card className="mt-8 p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Creator activity</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Your creator activity</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Creator-owned challenges, drafts, and active work appear here.</p>
            </div>
            <LinkButton href="/creator/challenges" variant="secondary">View All</LinkButton>
          </div>

          {hostedChallenges.length ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {hostedChallenges.slice(0, 3).map((challenge) => <CreatorActivityCard key={challenge.id} challenge={challenge} />)}
            </div>
          ) : (
            <div className="mt-6 rounded-[8px] border border-white/10 bg-black/25 p-6">
              <EmptyState icon={<Swords />} title="No creator activity yet" body="Create your first challenge or open Explore to join existing competitions." action={<div className="flex flex-col gap-3 sm:flex-row"><LinkButton href="/challenges/create">Create Challenge</LinkButton><LinkButton href="/explore" variant="secondary">Explore Challenges</LinkButton></div>} />
            </div>
          )}
        </Card>

        {badges.length ? <Card className="mt-8 p-6">
          <h2 className="flex gap-2 text-2xl font-black"><Award className="text-[var(--gold)]" /> Recent Badges</h2>
          {badges.slice(0, 3).map((badge) => <p key={badge.id ?? badge.name ?? badge.title} className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold">{badge.title ?? badge.name ?? "Achievement"}</p>)}
          <LinkButton href="/profile" variant="ghost" className="mt-8 w-full text-[var(--gold)]">View All Badges</LinkButton>
        </Card> : null}
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <BrandLogo imageClassName="h-16 w-16 border border-[var(--gold)]" />
          <div>
            {!freeCompetitor ? <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{effectiveTier.badgeLabel}</p> : null}
            <PageTitle title={effectiveTier.dashboardName} subtitle={isLoading ? "Loading your dashboard..." : `${firstName}, ${effectiveTier.dashboardSubtitle}`} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {quickActions.map((action) => <LinkButton key={action.href} href={action.href} variant={action.variant}>{action.label}</LinkButton>)}
        </div>
      </div>
      {errorMessage ? (
        <Card className="mt-8 p-6 md:p-8">
          <h2 className="text-2xl font-black text-[var(--gold-2)]">Dashboard could not load</h2>
          <p className="mt-3 text-slate-300">{errorMessage}</p>
        </Card>
      ) : null}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {tierStats.map((stat) => <Stat key={stat.title} className={dashboardStyle} icon={stat.icon} title={stat.title} value={isLoading ? "..." : String(stat.value)} label={stat.label} />)}
      </div>
      <Card className="mt-8 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-6 md:p-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Rewards</p>
            <h2 className="mt-2 flex items-center gap-2 text-2xl font-black"><Gift className="text-[var(--gold)]" /> Rewards & Spin Wheel</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Earn reward points from server-confirmed DoroCoin purchases, unlock tier-specific spin credits, and win prizes through reviewed reward flows.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <LinkButton href="/rewards/wheel">Open Spin Wheel</LinkButton>
            <LinkButton href="/rewards/history" variant="secondary">View Reward History</LinkButton>
          </div>
        </div>
      </Card>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {tierFeatures.map((feature) => (
          <TierFeatureCard key={feature.title} {...feature} />
        ))}
      </div>
      <div className={cn("mt-8 grid gap-8", badges.length ? "xl:grid-cols-[1.5fr_1fr]" : "xl:grid-cols-1")}>
        <Card className="p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black">Current Challenges</h2>
            <LinkButton href="/my-entries" variant="ghost" className="text-[var(--gold)]">View All</LinkButton>
          </div>
          {challenges.length ? (
            <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-1">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div>
          ) : (
            <Card className="p-6 text-slate-300"><EmptyState icon={<Swords />} title="No active challenges yet" body="Challenges you join, create, or submit entries to will appear here." action={<div className="flex flex-col gap-3 sm:flex-row"><LinkButton href="/explore">Explore Challenges</LinkButton><LinkButton href="/challenges/create" variant="secondary">Create Challenge</LinkButton></div>} /></Card>
          )}
        </Card>
        {badges.length ? <div className="space-y-8">
          <Card className="p-6">
            <h2 className="flex gap-2 text-2xl font-black"><Award className="text-[var(--gold)]" /> Recent Badges</h2>
            {badges.slice(0, 3).map((badge) => <p key={badge.id ?? badge.name ?? badge.title} className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold">{badge.title ?? badge.name ?? "Achievement"}</p>)}
            <LinkButton href="/profile" variant="ghost" className="mt-8 w-full text-[var(--gold)]">View All Badges</LinkButton>
          </Card>
        </div> : null}
      </div>
    </AppShell>
  );
}

function TierFeatureCard({ title, body, icon: Icon, active, href }: { title: string; body: string; icon: typeof Swords; active: boolean; href?: string }) {
  return (
    <Card className={cn("flex min-h-48 flex-col p-6", !active && "border-dashed opacity-80")}>
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-[8px]", active ? "bg-yellow-500/10 text-[var(--gold)]" : "bg-white/5 text-slate-500")}>
        <Icon size={21} />
      </div>
      <h2 className="mt-4 text-xl font-black">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-300">{body}</p>
      {href ? <LinkButton href={href} variant="ghost" className="mt-4 w-full">Open</LinkButton> : !active ? <LinkButton href="/subscriptions" variant="ghost" className="mt-4 w-full">{title === "Become a Host" ? "Upgrade to Host" : title === "Become a Creator" ? "Upgrade to Creator" : "View Upgrade"}</LinkButton> : null}
    </Card>
  );
}

function CreatorToolCard({ title, body, icon: Icon, href }: { title: string; body: string; icon: typeof Swords; href: string }) {
  return (
    <Card className="flex min-h-44 flex-col p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-yellow-500/10 text-[var(--gold)]"><Icon size={19} /></div>
      <h2 className="mt-4 text-lg font-black">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-300">{body}</p>
      <LinkButton href={href} variant="ghost" className="mt-4 w-full">Open</LinkButton>
    </Card>
  );
}

function CreatorActivityCard({ challenge }: { challenge: DashboardChallenge }) {
  const privateChallenge = isPrivateCreatorChallenge(challenge);
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "Draft").replaceAll("_", " ");
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-200">{privateChallenge ? "Private" : "Public"}</span>
        <span className="rounded-full border border-[var(--gold)]/20 bg-[var(--gold)]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--gold)]">{status}</span>
      </div>
      <h3 className="mt-4 line-clamp-2 text-xl font-black">{challenge.title}</h3>
      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-slate-300">{challenge.description || "Challenge setup details will appear as you publish updates."}</p>
      <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <span>{numberField(challenge, ["participantCount", "participants"])} participants</span>
        <span>{numberField(challenge, ["submissionCount", "submissions"])} entries</span>
      </div>
      <LinkButton href={`/challenges/${challenge.id}`} className="mt-5 w-full">View Challenge</LinkButton>
    </Card>
  );
}
function Stat({ icon, title, value, label, className }: { icon: ReactNode; title: string; value: string; label: string; className?: string | null }) {
  return <Card className={cn("flex items-center gap-5 p-6", className)}><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-[var(--gold)]/10 text-[var(--gold)]">{icon}</div><div><div className="font-bold">{title}</div><div className="text-3xl font-black text-[var(--gold-2)]">{value}</div><div className="text-sm text-slate-300">{label}</div></div></Card>;
}







