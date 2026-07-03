"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Medal, Trophy, UserRound, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PremiumBadge } from "@/components/brand";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchLeaderboards } from "@/lib/api/services";
import type { UserPlanId } from "@/lib/types";

const boards = [
  { id: "global", label: "Global" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "challenge", label: "Challenge" },
  { id: "creators", label: "Creators" },
  { id: "voters", label: "Voters" }
];

type LeaderboardRow = {
  id?: string;
  userId?: string;
  challengeId?: string;
  displayName?: string;
  name?: string;
  initials?: string;
  planId?: UserPlanId;
  badgeStyleId?: string;
  points?: number;
  wins?: number;
  votes?: number;
  submissions?: number;
  trend?: string;
  rank?: number;
};

function rowName(row: LeaderboardRow) {
  return row.displayName ?? row.name ?? "Challenge Suite Member";
}

export default function LeaderboardsPage() {
  const [board, setBoard] = useState("global");
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboards", board],
    queryFn: () => fetchLeaderboards(board),
    staleTime: 60_000
  });
  const rows = useMemo(() => ((data?.ok ? data.data?.entries : []) ?? []) as LeaderboardRow[], [data]);
  const leaderboardMessage = data?.ok ? data.data?.message : null;
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const errorMessage = !isLoading && data && !data.ok ? data.message : null;

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Leaderboards" subtitle="Live rankings across creators, voters, challenges, and winners." icon={<Trophy className="text-[var(--gold)]" />} />
        <LinkButton href="/challenges" className="w-full xl:w-auto">Find a Challenge</LinkButton>
      </div>

      <Card className="mt-8 p-3 md:p-4">
        <div className="scrollbar-dark flex gap-2 overflow-x-auto">
          {boards.map((item) => <Button key={item.id} variant={board === item.id ? "primary" : "ghost"} className="shrink-0 px-4" onClick={() => setBoard(item.id)}>{item.label}</Button>)}
        </div>
      </Card>

      {isLoading ? (
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((item) => <Card key={item} className="h-64 animate-pulse bg-[#151515]" />)}
        </div>
      ) : errorMessage ? (
        <Card className="mt-8"><EmptyState icon={<Trophy />} title="Leaderboard unavailable" body={errorMessage} action={<Button onClick={() => window.location.reload()}>Retry</Button>} /></Card>
      ) : leaderboardMessage && !rows.length ? (
        <Card className="mt-8"><EmptyState icon={<Trophy />} title="Leaderboard not public yet" body={leaderboardMessage} action={<LinkButton href="/challenges">Explore Challenges</LinkButton>} /></Card>
      ) : rows.length ? (
        <>
          <div className="mt-8 grid items-end gap-5 lg:grid-cols-[.85fr_1.15fr_.85fr]">
            {[podium[1], podium[0], podium[2]].filter(Boolean).map((row) => (
              <Card key={row.id ?? row.userId ?? row.rank} className={`p-5 text-center sm:p-6 ${row.rank === 1 ? "border-[var(--gold)]/50 bg-[radial-gradient(circle_at_top,rgba(245,217,10,.18),transparent_45%),#111]" : "bg-[#151515]"}`}>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--gold)]/30 bg-[var(--gold)] text-xl font-black text-black">{row.initials ?? rowName(row).slice(0, 2).toUpperCase()}</div>
                <div className="mt-4 text-sm font-black text-[var(--gold)]">#{row.rank}</div>
                <h2 className="mt-1 break-words text-xl font-black sm:text-2xl">{rowName(row)}</h2>
                <div className="mt-3 flex justify-center"><PremiumBadge planId={row.planId} badgeStyleId={row.badgeStyleId} compact /></div>
                <div className="mt-5 break-words text-3xl font-black text-[var(--gold)] sm:text-4xl">{Number(row.points ?? 0).toLocaleString()}</div>
                <p className="text-sm text-slate-400">points</p>
              </Card>
            ))}
          </div>

          <Card className="mt-8 overflow-hidden">
            {rest.length ? rest.map((row) => (
              <div key={row.id ?? row.userId ?? row.rank} className="grid gap-4 border-b border-white/10 p-4 sm:p-5 lg:grid-cols-[70px_minmax(0,1fr)_130px_120px_120px_150px] lg:items-center">
                <div className="text-2xl font-black text-[var(--gold)]">#{row.rank}</div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-black text-black">{row.initials ?? rowName(row).slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="break-words font-black">{rowName(row)}</div>
                    <PremiumBadge planId={row.planId} badgeStyleId={row.badgeStyleId} compact />
                  </div>
                </div>
                <div className="font-black">{Number(row.points ?? 0).toLocaleString()} pts</div>
                <div className="flex items-center gap-2 text-slate-300"><Medal size={16} className="shrink-0 text-[var(--gold)]" /> {Number(row.wins ?? 0)} wins</div>
                <div className="flex items-center gap-2 text-slate-300"><Vote size={16} className="shrink-0 text-[var(--gold)]" /> {Number(row.votes ?? 0)} votes</div>
                <div className="grid gap-2 sm:flex">
                  {row.challengeId ? <LinkButton href={`/challenges/${row.challengeId}`} variant="ghost" className="w-full sm:w-auto">Challenge</LinkButton> : null}
                  {row.userId ? <LinkButton href={`/profile?user=${row.userId}`} variant="secondary" className="w-full sm:w-auto"><UserRound size={15} /> Profile</LinkButton> : <ArrowUpRight size={18} />}
                </div>
              </div>
            )) : <div className="p-5 text-slate-300 sm:p-8">Only podium rankings are available for this board.</div>}
          </Card>
        </>
      ) : (
        <Card className="mt-8"><EmptyState icon={<Trophy />} title="No leaderboard entries yet" body="Rankings will appear once users submit, vote, win, and earn points." action={<LinkButton href="/challenges">Explore Challenges</LinkButton>} /></Card>
      )}
    </AppShell>
  );
}

