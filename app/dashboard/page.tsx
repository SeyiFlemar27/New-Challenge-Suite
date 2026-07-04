"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { ChallengeCard } from "@/components/domain-cards";
import { Activity, Award, BarChart3, Crown, Diamond, Flame, LockKeyhole, Medal, Radio, Rocket, ShieldCheck, Swords, Trophy, Users, UsersRound, Vote } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { findCustomizationOption } from "@/lib/customization/options";
import { cn } from "@/lib/utils";
import { getEffectiveTier, getPlanExperience } from "@/lib/plan-access";

type LeaderboardEntry = {
  displayName?: string;
  name?: string;
  points?: number;
  score?: number;
};

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
  const trendingChallenges = challenges.slice(0, 10);
  const leaderboard = (dashboard?.leaderboard ?? []) as LeaderboardEntry[];
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
  const tierFeatures = planExperience.planId === "free"
    ? freeCompetitor ? [
        { title: "Explore Challenges", body: "Discover active public competitions that match your interests.", icon: Swords, active: true },
        { title: "Join & Vote", body: "Submit entries and use your free daily vote on eligible challenges.", icon: Vote, active: true },
        { title: "Track Your Entries", body: "Follow submission status, votes, rankings, and wins in one place.", icon: Medal, active: true, href: "/my-entries" }
      ] : [
        { title: "Basic Public Challenge", body: "Create one public, non-monetized challenge per month.", icon: Swords, active: true, href: "/challenges/create" },
        { title: "My Challenges & Submissions", body: "Track your public challenges and review the entries they receive.", icon: Trophy, active: true, href: "/my-challenges" },
        { title: "Become a Host", body: "Run tournaments, live events, participant reviews, voting controls, and reports.", icon: LockKeyhole, active: false }
      ]
    : planExperience.planId === "creator"
      ? [
          { title: "Creator Analytics", body: "Track submissions, challenge activity, and basic creator performance.", icon: BarChart3, active: true },
          { title: "Sponsor Ready", body: "Create sponsor-enabled challenges and receive future sponsor requests.", icon: Rocket, active: true },
          { title: "Creator Earnings", body: "Review-only earnings foundation. Withdrawals and payouts are not active.", icon: ShieldCheck, active: true },
          { title: "Become a Host", body: "Run tournaments, live events, participant reviews, voting controls, and reports.", icon: Radio, active: false }
        ]
      : planExperience.planId === "pro"
        ? [
            { title: "Performance Analytics", body: "Study ranking history, highlighted submissions, votes, and challenge performance.", icon: Activity, active: true },
            { title: "Ranked Challenges", body: "Create ranked formats and join tournament experiences when available.", icon: Trophy, active: true },
            { title: "Amplification", body: `${planExperience.monthlyBoostLimit} boosts per month and vote multipliers up to ${planExperience.voteMultiplierLimit}x.`, icon: Rocket, active: true }
          ]
        : planExperience.planId === "host"
          ? [
              { title: "Competition Operations", body: "Manage participants, submission review, voting controls, tournaments, and live-event foundations.", icon: Radio, active: true, href: "/dashboard/host" },
              { title: "Host Team", body: `Team foundation for up to ${planExperience.teamMemberLimit} members. Invitations are not active yet.`, icon: UsersRound, active: true, href: "/dashboard/host/team" },
              { title: "Revenue Overview", body: "Read-only sponsorship and revenue review. Transfers and withdrawals remain inactive.", icon: ShieldCheck, active: true }
            ]
          : [
              { title: "Programs & Campaigns", body: "Coordinate branded programs, campaigns, and large competition foundations.", icon: Crown, active: true },
              { title: "Reports & Exports", body: "Enterprise reporting and export foundations for program oversight.", icon: BarChart3, active: true },
              { title: "Teams & Integrations", body: `Multi-admin foundation for up to ${planExperience.teamMemberLimit} members, with integration placeholders.`, icon: UsersRound, active: true, href: "/dashboard/host" }
            ];
  const quickActions = planExperience.planId === "free"
    ? freeCompetitor ? [
        { href: "/challenges", label: "Explore Challenges", variant: "secondary" as const },
        { href: "/my-entries", label: "My Entries", variant: "primary" as const },
        { href: "/subscriptions", label: "Upgrade to Creator", variant: "ghost" as const }
      ] : [
        { href: "/challenges/create", label: "Create Basic Challenge", variant: "primary" as const },
        { href: "/my-challenges", label: "My Challenges", variant: "secondary" as const },
        { href: "/subscriptions", label: "Upgrade to Host", variant: "ghost" as const }
      ]
    : planExperience.planId === "creator"
      ? [
          { href: "/challenges/create", label: "Create Challenge", variant: "primary" as const },
          { href: "/my-challenges", label: "Creator Projects", variant: "secondary" as const },
          { href: "/subscriptions", label: "Upgrade to Host", variant: "ghost" as const }
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
          { icon: <Swords />, title: "Creator Challenges", value: dashboard?.stats.activeChallenges ?? 0, label: planExperience.challengeLimitLabel },
          { icon: <Activity />, title: "Submissions", value: dashboard?.stats.submissionCount ?? 0, label: "Creator activity" },
          { icon: <Rocket />, title: "Monthly Boosts", value: planExperience.monthlyBoostLimit, label: "Creator allowance" }
        ]
      : planExperience.planId === "pro"
        ? [
            { icon: <Trophy />, title: "Performance Points", value: dashboard?.stats.totalPoints ?? 0, label: "Ranking performance" },
            { icon: <Activity />, title: "Submissions", value: dashboard?.stats.submissionCount ?? 0, label: "Portfolio activity" },
            { icon: <Rocket />, title: "Monthly Boosts", value: planExperience.monthlyBoostLimit, label: `${planExperience.voteMultiplierLimit}x vote limit` }
          ]
        : [
            { icon: <Swords />, title: planExperience.planId === "enterprise" ? "Active Programs" : "Active Competitions", value: dashboard?.stats.activeChallenges ?? 0, label: planExperience.challengeLimitLabel },
            { icon: <UsersRound />, title: "Team Capacity", value: planExperience.teamMemberLimit, label: "Foundation seats" },
            { icon: <BarChart3 />, title: "Reports & Exports", value: planExperience.features.data_export ? "Ready" : "Locked", label: "Operational foundation" }
          ];

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
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {tierFeatures.map((feature) => (
          <TierFeatureCard key={feature.title} {...feature} />
        ))}
      </div>
      <Card className="mt-8 p-6 md:p-8">
        <h2 className="flex items-center gap-2 text-2xl font-black text-[var(--gold-2)]"><Flame /> Trending Challenges</h2>
        <p className="text-slate-300">Join the most popular challenges happening right now</p>
        <div className="scrollbar-dark mt-8 flex gap-6 overflow-x-auto pb-2">
          {isLoading ? [0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="w-24 shrink-0 text-center">
              <div className="mx-auto h-20 w-20 animate-pulse rounded-full border-4 border-[var(--gold)] bg-[#222]" />
              <div className="mx-auto mt-2 h-4 w-20 animate-pulse rounded bg-[#222]" />
            </div>
          )) : trendingChallenges.length ? trendingChallenges.map((challenge) => (
            <div key={challenge.id} className="w-24 shrink-0 text-center">
              <div className="mx-auto h-20 w-20 rounded-full border-4 border-[var(--gold)] bg-cover bg-center" style={{ backgroundImage: `url(${challenge.imageUrl})` }} />
              <div className="mt-2 truncate text-sm font-bold">{challenge.title}</div>
              <div className="text-xs text-slate-400"><Users size={12} className="inline text-purple-400" /> {challenge.participants}</div>
            </div>
          )) : <p className="text-sm font-bold text-slate-300">No trending challenges yet.</p>}
        </div>
      </Card>
      <div className="mt-8 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black">Current Challenges</h2>
            <LinkButton href="/challenges" variant="ghost" className="text-[var(--gold)]">View All</LinkButton>
          </div>
          {isLoading ? (
            <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-1">{[0, 1].map((item) => <Card key={item} className="h-[430px] animate-pulse bg-[#171717]" />)}</div>
          ) : challenges.length ? (
            <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-1">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div>
          ) : (
            <Card className="p-6 text-slate-300">No current challenges are available yet.</Card>
          )}
        </Card>
        <div className="space-y-8">
          <Card className="p-6">
            <h2 className="flex gap-2 text-2xl font-black"><Trophy className="text-[var(--gold)]" /> Top Performers</h2>
            {isLoading ? [0, 1, 2].map((item) => <div key={item} className="mt-5 h-16 animate-pulse rounded-[8px] bg-[#1a1a1a]" />) : leaderboard.length ? leaderboard.slice(0, 3).map((row, i) => {
              const name = row.displayName ?? row.name ?? "Unnamed performer";
              const points = Number(row.points ?? row.score ?? 0).toLocaleString();
              return <div key={`${name}-${i}`} className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold">{i + 1}. {name} - {points} pts</div>;
            }) : <div className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold text-slate-300">No leaderboard entries yet.</div>}
            <LinkButton href="/leaderboards" variant="ghost" className="mt-5 w-full text-[var(--gold)]">View Full Leaderboard</LinkButton>
          </Card>
          <Card className="p-6">
            <h2 className="flex gap-2 text-2xl font-black"><Award className="text-[var(--gold)]" /> Recent Badges</h2>
            {isLoading ? <div className="mt-8 h-7 w-64 animate-pulse rounded bg-[#1a1a1a]" /> : badges.length ? badges.slice(0, 3).map((badge) => <p key={badge.id ?? badge.name ?? badge.title} className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold">{badge.title ?? badge.name ?? "Achievement"}</p>) : <p className="mt-8 text-xl font-bold">No badges yet. Start participating!</p>}
            <LinkButton href="/profile" variant="ghost" className="mt-8 w-full text-[var(--gold)]">View All Badges</LinkButton>
          </Card>
        </div>
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

function Stat({ icon, title, value, label, className }: { icon: React.ReactNode; title: string; value: string; label: string; className?: string | null }) {
  return <Card className={cn("flex items-center gap-5 p-6", className)}><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-[var(--gold)]/10 text-[var(--gold)]">{icon}</div><div><div className="font-bold">{title}</div><div className="text-3xl font-black">{value} <span className="text-base text-emerald-400">+0</span></div><div className="text-sm text-slate-300">{label}</div></div></Card>;
}
