"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Medal, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, inputClass, PageTitle } from "@/components/ui";
import { fetchLeaderboards } from "@/lib/api/services";
import { ChallengePagination } from "@/components/challenge-pagination";
import { CHALLENGE_PAGE_SIZE } from "@/lib/challenge-pagination";

type Row = { id: string; userId?: string; displayName: string; initials?: string; avatarUrl?: string; points?: number; wins?: number; votes?: number; submissions?: number; rank: number; status?: string };
type Payload = { entries: Row[]; message?: string | null; status?: string; competitionMode?: string; pagination?: { page: number; pageSize: number; total: number; totalPages: number }; currentUserPosition?: Row | null };
type Board = "global" | "challenge" | "tournament";
type Period = "week" | "month" | "all";

function ordinal(rank: number) { return rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : String(rank); }
function stateLabel(payload: Payload | null) {
  if (!payload) return "Standings";
  if (payload.status === "final") return "Final Results";
  if (payload.status === "under_review" || payload.status === "locked") return "Results Under Review";
  if (payload.competitionMode === "tournament") return "Tournament In Progress";
  if (payload.competitionMode === "judges") return "Judging In Progress";
  return "Live Standings";
}

export default function LeaderboardsPage() {
  const [board, setBoard] = useState<Board>("global");
  const [period, setPeriod] = useState<Period>("all");
  const [challengeId, setChallengeId] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const nextBoard = params.get("board"); if (nextBoard === "challenge" || nextBoard === "tournament") setBoard(nextBoard); const nextPeriod = params.get("period"); if (nextPeriod === "week" || nextPeriod === "month") setPeriod(nextPeriod); setChallengeId(params.get("challengeId") ?? ""); setPage(Math.max(1, Number(params.get("page") ?? 1) || 1)); }, []);
  const canLoad = board === "global" || challengeId.trim().length > 0;
  const query = useQuery({ queryKey: ["leaderboards", { board, period, challengeId, page }], queryFn: () => fetchLeaderboards(board, { type: board, challengeId: challengeId.trim() || undefined, period, page }), enabled: canLoad, staleTime: 15_000, refetchInterval: 30_000 });
  const payload = query.data?.ok ? query.data.data as Payload : null;
  const rows = useMemo(() => payload?.entries ?? [], [payload]);
  const podium = page === 1 ? rows.filter((row) => row.rank <= 3) : [];
  const rest = page === 1 ? rows.filter((row) => row.rank > 3) : rows;
  const currentUserPosition = payload?.currentUserPosition ?? null;
  const pagination = payload?.pagination ?? null;
  const competitionMode = payload?.competitionMode;
  const error = query.data && !query.data.ok ? query.data.message : null;
  const switchBoard = (next: Board) => { setBoard(next); setPage(1); };
  const changePage = (next: number) => { setPage(next); const url = new URL(window.location.href); url.searchParams.set("board", board); url.searchParams.set("period", period); url.searchParams.set("page", String(next)); if (challengeId) url.searchParams.set("challengeId", challengeId); window.history.pushState(null, "", url); };

  return <AppShell><div className="mx-auto max-w-6xl"><PageTitle title="Leaderboards" subtitle="Authoritative participant standings from confirmed wins, valid votes, judging, and tournament results." icon={<Trophy className="text-[var(--gold)]" />} />
    <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard scope">{(["global", "challenge", "tournament"] as Board[]).map((item) => <Button key={item} role="tab" aria-selected={board === item} variant={board === item ? "primary" : "secondary"} onClick={() => switchBoard(item)}>{item === "global" ? "Global" : item === "challenge" ? "Challenge" : "Tournament"}</Button>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{board === "global" ? <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Time period</span><select className={inputClass} value={period} onChange={(event) => { setPeriod(event.target.value as Period); setPage(1); }}><option value="week">This Week</option><option value="month">This Month</option><option value="all">All Time</option></select></label> : <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">{board === "challenge" ? "Challenge" : "Tournament"} reference</span><input className={inputClass} value={challengeId} onChange={(event) => { setChallengeId(event.target.value); setPage(1); }} placeholder={`Enter ${board} reference`} /></label>}</div>

    {!canLoad ? <Card className="mt-8"><EmptyState icon={<Trophy />} title={`Choose a ${board}`} body={`Enter a ${board} reference to load its authoritative standings.`} /></Card> : query.isLoading ? <div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-64 animate-pulse" />)}</div> : error ? <Card className="mt-8"><EmptyState icon={<Trophy />} title="Leaderboard unavailable" body={error} /></Card> : payload?.message && !rows.length ? <Card className="mt-8"><EmptyState icon={<Trophy />} title="No standings yet" body={payload.message} /></Card> : rows.length ? <>
      <p className="mt-8 text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{stateLabel(payload)}</p>
      {podium.length ? <div className="mt-5 grid items-end gap-4 sm:grid-cols-3">{[podium.find((row) => row.rank === 2), podium.find((row) => row.rank === 1), podium.find((row) => row.rank === 3)].filter((row): row is Row => Boolean(row)).map((row) => <Podium key={row.id} row={row} />)}</div> : null}
      {currentUserPosition && currentUserPosition.rank > 3 ? <Card className="mt-6 flex items-center gap-4 border-[var(--gold)]/30 p-4"><span className="text-2xl font-black text-[var(--gold)]">{currentUserPosition.rank}</span><div><p className="text-xs font-black uppercase text-slate-500">Your position</p><p className="font-black">{currentUserPosition.displayName}</p></div><strong className="ml-auto">{Number(currentUserPosition.points ?? 0).toLocaleString()} pts</strong></Card> : null}
      {rest.length ? <Card id="leaderboard-results" className="mt-6 scroll-mt-24 overflow-hidden">{rest.map((row) => <div key={row.id} className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-[48px_minmax(0,1fr)_130px] sm:items-center"><span className="text-xl font-black text-slate-400">{row.rank}</span><div className="flex min-w-0 items-center gap-3"><Avatar row={row} /><div><p className="truncate font-black">{row.displayName}</p><p className="text-xs text-slate-400">{competitionMode === "tournament" ? `${Number(row.wins ?? 0)} wins · ${Number(row.submissions ?? 0)} losses` : `${Number(row.wins ?? 0)} wins · ${Number(row.votes ?? 0)} valid votes`}</p></div></div><strong className="sm:text-right">{Number(row.points ?? 0).toLocaleString()} pts</strong></div>)}</Card> : null}
      {pagination ? <ChallengePagination page={page} total={pagination.total} pageSize={pagination.pageSize || CHALLENGE_PAGE_SIZE} disabled={query.isFetching} anchorId="leaderboard-results" onPageChange={changePage} /> : null}
    </> : <Card className="mt-8"><EmptyState icon={<Trophy />} title="No rankings yet" body="Rankings appear only after authoritative competition activity exists." /></Card>}
  </div></AppShell>;
}

function Podium({ row }: { row: Row }) { const first = row.rank === 1; return <Card className={`p-5 text-center ${first ? "sm:order-none sm:min-h-[310px] border-[var(--gold)]/50" : "sm:min-h-[270px]"}`}><div className={`mx-auto ${first ? "h-20 w-20" : "h-16 w-16"}`}><Avatar row={row} large /></div><p className={`mt-4 font-black ${row.rank === 1 ? "text-[var(--gold)]" : row.rank === 2 ? "text-slate-300" : "text-amber-700"}`}>{first ? <Crown className="mx-auto mb-1" size={20} /> : <Medal className="mx-auto mb-1" size={18} />}{ordinal(row.rank)}</p><h2 className="mt-2 break-words text-xl font-black">{row.displayName}</h2><p className="mt-3 text-3xl font-black">{Number(row.points ?? 0).toLocaleString()}</p><p className="text-xs text-slate-400">points</p></Card>; }
function Avatar({ row, large = false }: { row: Row; large?: boolean }) { return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--gold)] font-black text-black ${large ? "h-full w-full text-lg" : "h-11 w-11 text-xs"}`}>{row.avatarUrl ? <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" /> : row.initials ?? row.displayName.slice(0, 2).toUpperCase()}</span>; }
