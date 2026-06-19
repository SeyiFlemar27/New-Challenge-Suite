"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { ChallengeCard } from "@/components/domain-cards";
import { Award, Diamond, Flame, Medal, Swords, Trophy, Users } from "lucide-react";
import { BrandLogo, PremiumBadge } from "@/components/brand";
import { fetchDashboard } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import type { UserPlanId } from "@/lib/types";

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

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    staleTime: 30_000
  });

  const dashboard = data?.ok ? data.data : null;
  const challenges = useMemo(() => {
    return (dashboard?.challenges ?? []).map((item) => normalizeChallenge(item as ChallengeApiRecord)).filter((item) => item.id);
  }, [dashboard?.challenges]);
  const trendingChallenges = challenges.slice(0, 10);
  const leaderboard = (dashboard?.leaderboard ?? []) as LeaderboardEntry[];
  const badges = (dashboard?.badges ?? []) as BadgeRecord[];
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;
  const displayName = dashboard?.user.displayName || "there";
  const planId = dashboard?.user.planId as UserPlanId | undefined;

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <BrandLogo imageClassName="h-16 w-16 border border-[var(--gold)]" />
          <PageTitle title="Dashboard" subtitle={isLoading ? "Loading your dashboard..." : `Welcome back, ${displayName}. Ready to take on new challenges?`} />
          {!isLoading ? <PremiumBadge planId={planId} /> : null}
        </div>
        <div className="flex flex-wrap gap-4">
          <LinkButton href="/challenges" variant="secondary">Find Challenge</LinkButton>
          <LinkButton href="/challenges/create">Create Challenge</LinkButton>
        </div>
      </div>
      {errorMessage ? (
        <Card className="mt-8 p-6 md:p-8">
          <h2 className="text-2xl font-black text-[var(--gold-2)]">Dashboard could not load</h2>
          <p className="mt-3 text-slate-300">{errorMessage}</p>
        </Card>
      ) : null}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Stat icon={<Swords />} title="Active Challenges" value={isLoading ? "..." : String(dashboard?.stats.activeChallenges ?? 0)} label="In Progress" />
        <Stat icon={<Diamond />} title="Points Earned" value={isLoading ? "..." : String(dashboard?.stats.totalPoints ?? 0)} label="Total Points" />
        <Stat icon={<Medal />} title="Badges Collected" value={isLoading ? "..." : String(dashboard?.stats.badgeCount ?? 0)} label="Total Earned" />
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

function Stat({ icon, title, value, label }: { icon: React.ReactNode; title: string; value: string; label: string }) {
  return <Card className="flex items-center gap-5 p-6"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-indigo-950 text-purple-300">{icon}</div><div><div className="font-bold">{title}</div><div className="text-3xl font-black">{value} <span className="text-base text-emerald-400">+0</span></div><div className="text-sm text-slate-300">{label}</div></div></Card>;
}
