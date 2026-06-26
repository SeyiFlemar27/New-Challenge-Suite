"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { WinnerCard } from "@/components/domain-cards";
import { Button, Card, PageTitle } from "@/components/ui";
import { fetchWinners } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { Search } from "lucide-react";

type WinnerRecord = SubmissionApiRecord & {
  challenge?: unknown;
  rank?: number;
  position?: number;
  submissionId?: string;
  status?: string;
  resultMessage?: string;
  payoutStatus?: string;
};

export default function WinnersPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["winners"],
    queryFn: fetchWinners,
    staleTime: 60_000
  });

  const winners = useMemo(() => {
    if (!data?.ok || !data.data?.winners) return [];
    return data.data.winners.map((item) => {
      const record = item as WinnerRecord;
      const challenge = record.challenge ? normalizeChallenge(record.challenge as ChallengeApiRecord) : undefined;
      return { ...normalizeSubmission({ ...record, id: record.submissionId ?? record.id, isWinner: record.status !== "pending_review" }, challenge), winnerStatus: record.status, position: record.position ?? record.rank, resultMessage: record.resultMessage, payoutStatus: record.payoutStatus };
    }).filter((item) => item.id);
  }, [data]);

  const visibleWinners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return winners;
    return winners.filter((winner) =>
      winner.title.toLowerCase().includes(query) ||
      winner.challengeTitle.toLowerCase().includes(query) ||
      winner.userName.toLowerCase().includes(query)
    );
  }, [search, winners]);

  const errorMessage = !isLoading && data && !data.ok ? data.message : null;
  const resultMessage = data?.ok ? data.data?.message : null;

  return (
    <AppShell>
      <PageTitle title="Winners" subtitle="Winner results and prize review status for completed challenges" />
      <div className="mt-9 flex flex-col gap-4 md:flex-row md:items-center">
        <Button variant="secondary">All Challenges</Button>
        <Card className="flex h-14 w-full max-w-[520px] items-center gap-4 bg-[#11151d] px-6 text-slate-400"><Search size={20} /> <input className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-400" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search challenges..." /> <Button className="ml-auto h-9">Search</Button></Card>
      </div>
      {resultMessage ? <Card className="mt-8 border-yellow-500/30 bg-yellow-950/10 p-5 text-[var(--gold)]">{resultMessage}</Card> : null}
      <h2 className="mt-10 text-2xl font-black">Winner Results ({visibleWinners.length})</h2>
      {isLoading ? (
        <div className="mt-8 grid gap-7 md:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-[330px] animate-pulse bg-[#0f141d]" />)}</div>
      ) : errorMessage ? (
        <Card className="mt-8 p-8">
          <h3 className="text-2xl font-black text-[var(--gold-2)]">Winners could not load</h3>
          <p className="mt-3 text-slate-300">{errorMessage}</p>
        </Card>
      ) : visibleWinners.length ? (
        <div className="mt-8 grid gap-7 md:grid-cols-2 xl:grid-cols-4">{visibleWinners.map((winner) => <div key={winner.id} className="space-y-3"><WinnerCard submission={winner} /><div className="rounded-[8px] border border-white/10 bg-black/30 p-3 text-sm text-slate-300"><b className="text-[var(--gold)]">#{winner.position ?? "-"}</b> - {String(winner.winnerStatus ?? "announced").replaceAll("_", " ")}{winner.payoutStatus && winner.payoutStatus !== "not_applicable" ? ` - Payout review: not active yet (${String(winner.payoutStatus).replaceAll("_", " ")})` : ""}</div></div>)}</div>
      ) : (
        <Card className="mt-8 p-8 text-slate-300">No winners have been recorded yet.</Card>
      )}
    </AppShell>
  );
}



