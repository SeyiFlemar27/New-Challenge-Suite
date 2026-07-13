"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { ChallengeCard } from "@/components/domain-cards";
import { Activity, Award, BarChart3, Crown, Diamond, Flame, Gift, Medal, Radio, Rocket, ShieldCheck, Swords, Trophy, Users, UsersRound, Vote } from "lucide-react";
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
        { title: "Create Basic Challenge", body: "Create up to three lifetime public, non-monetized challenges before upgrading.", icon: Swords, active: true, href: "/challenges/create" },
        { title: "My Challenges", body: "Draft, publish, and track your Free Basic Challenge activity.", icon: Trophy, active: true, href: "/my-challenges" },
        { title: "Join & Vote", body: "Submit entries and use your free daily vote on eligible public challenges.", icon: Vote, active: true, href: "/challenges" }
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
  const dashboardUserRecord = (dashboard?.user ?? {}) as Record<string, unknown>;
  const kycStatus = String(dashboardUserRecord.kycStatus ?? "not_required");
  const showKycBanner = Boolean(dashboardUserRecord.kycRequired && kycStatus !== "verified" && kycStatus !== "not_required");
  const quickActions = planExperience.planId === "free"
    ? freeCompetitor ? [
        { href: "/challenges/create", label: "Create Basic Challenge", variant: "primary" as const },
        { href: "/my-challenges", label: "My Challenges", variant: "secondary" as const },
        { href: "/challenges", label: "Explore Challenges", variant: "ghost" as const }
      ] : [
        { href: "/challenges/create", label: "Create Basic Challenge", variant: "primary" as const },
        { href: "/my-challenges", label: "My Challenges", variant: "secondary" as const }
      ]
    : planExperience.planId === "creator"
      ? [
          { href: "/challenges/create", label: "Create Challenge", variant: "primary" as const },
          { href: "/my-challenges", label: "Creator Projects", variant: "secondary" as const },
          { href: "/my-entries", label: "My Entries", variant: "ghost" as const }
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
          { icon: <Swords />, title: "Created Challenges", value: dashboard?.stats.activeChallenges ?? 0, label: planExperience.challengeLimitLabel },
          { icon: <Activity />, title: "Submissions", value: dashboard?.stats.submissionCount ?? 0, label: "Entries received and created" },
          { icon: <Rocket />, title: "Monthly Boosts", value: planExperience.monthlyBoostLimit, label: "Boost allowance" }
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
            { icon: <BarChart3 />, title: "Reports & Exports", value: planExperience.features.data_export ? "Ready" : "Locked", label: "Operational access" }
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

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <BrandLogo imageClassName="h-16 w-16 border border-[var(--gold)]" />
          <div>
            {planExperience.planId === "creator" ? <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Creator Plan</p> : !freeCompetitor ? <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{effectiveTier.badgeLabel}</p> : null}
            <PageTitle title={planExperience.planId === "creator" ? "Creator Studio" : effectiveTier.dashboardName} subtitle={planExperience.planId === "creator" ? undefined : isLoading ? "Loading your dashboard..." : `${firstName}, ${effectiveTier.dashboardSubtitle}`} />
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
      {showKycBanner && planExperience.planId !== "creator" ? <Card className="mt-8 border-yellow-500/25 bg-yellow-500/5 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Premium Pending KYC</p><h2 className="mt-2 text-xl font-black">Identity verification required</h2><p className="mt-2 text-sm leading-6 text-slate-300">Your premium payment is active, but premium-sensitive tools remain locked until Sumsub verification is complete. Free/basic participation tools remain available.</p><LinkButton href="/kyc/start" className="mt-4">Start Verification</LinkButton></Card> : null}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {tierStats.map((stat) => <Stat key={stat.title} className={dashboardStyle} icon={stat.icon} title={stat.title} value={isLoading ? "..." : String(stat.value)} label={stat.label} />)}
      </div>
      {planExperience.planId !== "creator" ? <Card className="mt-8 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-6 md:p-8">
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
      </Card> : null}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {tierFeatures.map((feature) => (
          <TierFeatureCard key={feature.title} {...feature} />
        ))}
      </div>
      {planExperience.planId === "creator" ? <Card className="mt-8 p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="flex items-center gap-2 text-2xl font-black text-[var(--gold-2)]"><Flame /> Trending Challenges</h2><p className="mt-1 text-slate-300">Challenges gaining the most participation right now.</p></div>
          <LinkButton href="/challenges" variant="secondary">View All Trending</LinkButton>
        </div>
        <div className="scrollbar-dark mt-6 flex gap-5 overflow-x-auto pb-2">
          {trendingChallenges.length ? trendingChallenges.map((challenge) => <Link key={challenge.id} href={`/challenges/${challenge.id}`} className="w-60 shrink-0 rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-[var(--gold)]/50"><div className="h-32 rounded-[8px] bg-cover bg-center transition hover:scale-[1.01]" style={{ backgroundImage: `url(${challenge.imageUrl})` }} /><div className="mt-3 line-clamp-2 text-sm font-black">{challenge.title}</div><div className="mt-2 text-xs text-slate-400"><Users size={12} className="inline text-[var(--gold)]" /> {challenge.participants} participants</div></Link>) : <p className="text-sm font-bold text-slate-300">No trending challenges yet.</p>}
        </div>
      </Card> : null}
      {planExperience.planId === "creator" ? <div className="mt-8 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Creator operations</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">Manage your challenges</h2><p className="mt-2 text-slate-300">Review challenge status, submissions, voting state, and next actions.</p></div><LinkButton href="/creator/submissions" variant="secondary">Review Submissions</LinkButton></div> : null}
      <div className="mt-8 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black">{planExperience.planId === "creator" ? "Manage your challenges" : "Current Challenges"}</h2>
            <LinkButton href={planExperience.planId === "creator" ? "/my-challenges" : "/challenges"} variant="ghost" className="text-[var(--gold)]">View All</LinkButton>
          </div>
          {challenges.length ? (
            <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-1">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}</div>
          ) : (
            <Card className="p-6 text-slate-300">{planExperience.planId === "creator" ? <div><h3 className="text-xl font-black text-white">No challenges created yet</h3><p className="mt-2 text-sm text-slate-300">Create your first challenge to start receiving entries.</p><LinkButton href="/challenges/create" className="mt-5">Create Challenge</LinkButton></div> : "No current challenges are available yet."}</Card>
          )}
        </Card>
        <div className="space-y-8">
          <Card className="p-6">
            <h2 className="flex gap-2 text-2xl font-black"><Trophy className="text-[var(--gold)]" /> {planExperience.planId === "creator" ? "Challenge Performance" : "Top Performers"}</h2>
            {leaderboard.length ? leaderboard.slice(0, 3).map((row, i) => {
              const name = row.displayName ?? row.name ?? "Unnamed performer";
              const points = Number(row.points ?? row.score ?? 0).toLocaleString();
              return <div key={`${name}-${i}`} className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold">{i + 1}. {name} - {points} pts</div>;
            }) : <div className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold text-slate-300">Performance data will appear as challenges receive activity.</div>}
            <LinkButton href={planExperience.planId === "creator" ? "/creator/analytics" : "/leaderboards"} variant="ghost" className="mt-5 w-full text-[var(--gold)]">{planExperience.planId === "creator" ? "Open Creator Analytics" : "View Full Leaderboard"}</LinkButton>
          </Card>
          <Card className="p-6">
            <h2 className="flex gap-2 text-2xl font-black"><Award className="text-[var(--gold)]" /> Recent Badges</h2>
            {badges.length ? badges.slice(0, 3).map((badge) => <p key={badge.id ?? badge.name ?? badge.title} className="mt-5 rounded-[8px] bg-[#1a1a1a] p-5 font-bold">{badge.title ?? badge.name ?? "Achievement"}</p>) : <p className="mt-8 text-xl font-bold">No badges yet. Start participating!</p>}
            <LinkButton href="/profile" variant="ghost" className="mt-8 w-full text-[var(--gold)]">View All Badges</LinkButton>
          </Card>
        </div>
      </div>
      <Card className={`mt-8 p-6 md:p-8 ${planExperience.planId === "creator" ? "hidden" : ""}`}>
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

function Stat({ icon, title, value, label, className }: { icon: ReactNode; title: string; value: string; label: string; className?: string | null }) {
  return <Card className={cn("flex items-center gap-5 p-6", className)}><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-[var(--gold)]/10 text-[var(--gold)]">{icon}</div><div><div className="font-bold">{title}</div><div className="text-3xl font-black text-[var(--gold-2)]">{value}</div><div className="text-sm text-slate-300">{label}</div></div></Card>;
}




