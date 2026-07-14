"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { WinnerCard } from "@/components/domain-cards";
import { Button, Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { fetchWinners } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { Search, Trophy } from "lucide-react";

type WinnerRecord = SubmissionApiRecord & {
  challenge?: unknown;
  rank?: number;
  position?: number;
  submissionId?: string;
  status?: string;
  resultMessage?: string;
  payoutStatus?: string;
};

function prizeStatusLabel(status?: string) {
  const value = String(status ?? "not_available");
  if (value === "approved") return "Claim approved";
  if (value === "pending" || value === "pending_review") return "Prize claim pending review";
  if (value === "rejected") return "Claim unavailable";
  if (value === "not_applicable") return "Prize review not available yet";
  return "Winner announced";
}

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
      return { ...normalizeSubmission({ ...record, id: record.submissionId ?? record.id, isWinner: record.status !== "pending_review" }, challenge), winnerStatus: record.status, position: record.position ?? record.rank, rank: record.rank, resultMessage: record.resultMessage, payoutStatus: record.payoutStatus, prizeStatusLabel: prizeStatusLabel(record.payoutStatus), challengeImageUrl: challenge?.imageUrl };
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
      <PageTitle title="Winners" subtitle="Celebrated challenge results from across Challenge Suite." />
      <div className="mt-8 grid gap-4 md:flex md:items-center">
        <Button className="w-full md:w-auto" variant="secondary">All Challenges</Button>
        <Card className="grid w-full max-w-[520px] gap-3 bg-[#11151d] p-4 text-slate-400 sm:flex sm:min-h-14 sm:items-center sm:gap-4 sm:px-6 sm:py-0"><div className="flex min-w-0 items-center gap-3"><Search size={20} className="shrink-0" /> <input className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-400" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search winners or challenges" /></div> <Button className="w-full sm:ml-auto sm:h-9 sm:w-auto">Search</Button></Card>
      </div>
      {resultMessage ? <Card className="mt-8 border-yellow-500/30 bg-yellow-950/10 p-5 text-[var(--gold)]">{resultMessage}</Card> : null}
      <h2 className="mt-10 text-xl font-black sm:text-2xl">Winner Results ({visibleWinners.length})</h2>
      {isLoading ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-[330px] animate-pulse bg-[#0f141d]" />)}</div>
      ) : errorMessage ? (
        <Card className="mt-8 p-5 sm:p-8">
          <h3 className="text-xl font-black text-[var(--gold-2)] sm:text-2xl">Winners could not load</h3>
          <p className="mt-3 text-slate-300">{errorMessage}</p>
        </Card>
      ) : visibleWinners.length ? (
        <div className="mt-8 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{visibleWinners.map((winner) => <WinnerCard key={winner.id} submission={winner} />)}</div>
      ) : (
        <Card className="mt-8"><EmptyState icon={<Trophy />} title="No winners announced yet" body="Winners will appear here once challenges are completed and results are confirmed." action={<LinkButton href="/challenges">Explore Challenges</LinkButton>} /></Card>
      )}
    </AppShell>
  );
}

