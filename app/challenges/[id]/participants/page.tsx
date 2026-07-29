"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChallengeParticipantCard, type PublicVotingAccess } from "@/components/challenge-participant-card";
import { Card, EmptyState, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import type { PublicChallengeParticipant } from "@/lib/server/challenge-participants";

interface ParticipantsResponse {
  challenge: { id: string; title?: string; status?: string };
  phaseSummary: { label?: string; votingOpen?: boolean };
  participants: PublicChallengeParticipant[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
  votingAccess: PublicVotingAccess;
}

export default function ChallengeParticipantsPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"highest_votes" | "newest">("highest_votes");
  const [page, setPage] = useState(1);
  const queryKey = ["challenge-participants", challengeId, search, sort, page];
  const query = useQuery({
    queryKey,
    queryFn: () => apiRequest<ParticipantsResponse>(`/api/challenges/${challengeId}/participants?search=${encodeURIComponent(search)}&sort=${sort}&page=${page}&pageSize=12`),
    enabled: Boolean(challengeId),
    staleTime: 15_000
  });
  const payload = query.data?.ok ? query.data.data : null;
  const returnPath = `/challenges/${challengeId}/participants`;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  if (query.isLoading) return <AppShell><Card className="h-[520px] animate-pulse" /></AppShell>;
  if (!payload) {
    return <AppShell><Card className="p-8"><PageTitle title="Challenge Participants" subtitle={query.data?.message ?? "This challenge is unavailable."} icon={<Users />} /><LinkButton href="/explore" className="mt-6">Back to Explore</LinkButton></Card></AppShell>;
  }

  return (
    <AppShell>
      <div className="max-w-[1320px]">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle title="Challenge Participants" subtitle={payload.challenge.title || "Eligible challenge entries"} icon={<Users />} />
          <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-300">
            <span>{payload.pagination.total.toLocaleString()} eligible</span>
            <span className="rounded-full bg-[var(--gold)]/10 px-3 py-1 text-[var(--gold)]">{payload.phaseSummary.label || "Challenge"}</span>
          </div>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <form onSubmit={submitSearch} className="flex gap-3">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search participants</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input className={`${inputClass} pl-11`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search participants or entries" />
            </label>
            <button type="submit" className="min-h-12 rounded-[8px] bg-[var(--gold)] px-5 font-black text-black">Search</button>
          </form>
          <label>
            <span className="sr-only">Sort participants</span>
            <select className={inputClass} value={sort} onChange={(event) => { setSort(event.target.value as "highest_votes" | "newest"); setPage(1); }}>
              <option value="highest_votes">Highest votes</option>
              <option value="newest">Newest entries</option>
            </select>
          </label>
        </div>

        {payload.participants.length ? (
          <div className="mt-7 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {payload.participants.map((participant) => (
              <ChallengeParticipantCard
                key={participant.submissionId}
                challengeId={challengeId}
                participant={participant}
                votingAccess={payload.votingAccess}
                returnPath={returnPath}
                onVoteRecorded={() => queryClient.invalidateQueries({ queryKey: ["challenge-participants", challengeId] })}
              />
            ))}
          </div>
        ) : (
          <Card className="mt-7 border-dashed"><EmptyState icon={<Users />} title="No eligible participants" body={search ? "No participants or entries match your search." : "Approved entries will appear here when they are available."} /></Card>
        )}

        {payload.pagination.total > payload.pagination.pageSize ? (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 rounded-[8px] border border-white/10 px-5 font-bold disabled:opacity-40">Previous</button>
            <span className="text-sm font-bold text-slate-400">Page {page}</span>
            <button type="button" disabled={!payload.pagination.hasMore} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-[8px] border border-white/10 px-5 font-bold disabled:opacity-40">Next</button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
