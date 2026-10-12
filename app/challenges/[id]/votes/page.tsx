"use client";

import { useParams } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { ChallengeParticipantCard, type PublicPredictionAccess, type PublicVotingAccess } from "@/components/challenge-participant-card";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import type { PublicChallengeParticipant } from "@/lib/server/challenge-participants";

interface VotingParticipantsResponse {
  challenge: { id: string; title?: string; status?: string };
  phaseSummary: { label?: string; votingOpen?: boolean };
  participants: PublicChallengeParticipant[];
  pagination: { page: number; pageSize: number; total: number | null; hasMore: boolean };
  votingAccess: PublicVotingAccess;
  predictionAccess: PublicPredictionAccess;
}

export default function ChallengeVotingPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["challenge-voting-participants", challengeId, auth.user?.uid ?? "signed-out"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => apiRequest<VotingParticipantsResponse>(`/api/challenges/${challengeId}/participants?page=${pageParam}&pageSize=36&sort=highest_votes`),
    getNextPageParam: (lastPage) => lastPage.ok && lastPage.data?.pagination.hasMore ? lastPage.data.pagination.page + 1 : undefined,
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 15_000
  });
  const pages = query.data?.pages ?? [];
  const payload = pages[0]?.ok ? pages[0].data : null;
  const participants = pages.flatMap((page) => page.ok && page.data ? page.data.participants : []).filter((item, index, all) => all.findIndex((candidate) => candidate.submissionId === item.submissionId) === index);
  const hasMore = pages.at(-1)?.ok ? Boolean(pages.at(-1)?.data?.pagination.hasMore) : false;
  const returnPath = `/challenges/${challengeId}/votes`;

  if (auth.loading || query.isLoading) return <AppShell><Card className="mx-auto h-64 max-w-5xl animate-pulse" /></AppShell>;
  if (!payload) return <AppShell><Card className="mx-auto max-w-5xl p-8"><PageTitle title="Challenge Voting" subtitle={pages[0]?.message ?? "Challenge voting is unavailable."} icon={<Vote className="text-[var(--gold)]" />} /><LinkButton href={`/challenges/${challengeId}`} className="mt-6" variant="secondary">Return to Challenge</LinkButton></Card></AppShell>;

  const votingOpen = Boolean(payload.phaseSummary.votingOpen);
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <Card className="p-5 sm:p-8">
          <PageTitle title="Challenge Voting" subtitle={payload.challenge.title ?? "Eligible challenge entries"} icon={<Vote className="text-[var(--gold)]" />} />
          {!votingOpen ? <p className="mt-7 rounded-lg bg-slate-100 p-4 text-slate-700">Voting is not open. Return when the challenge voting window opens.</p>
            : payload.participants.length === 0 ? <p className="mt-7 rounded-lg bg-slate-100 p-4 text-slate-700">No eligible submissions are available for voting yet.</p>
              : <>
                <p className="mt-6 text-sm text-slate-600">Choose an approved entry to cast your eligible vote. Each verified vote counts equally.</p>
                <div className="mobile-card-list mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {participants.map((participant) => <ChallengeParticipantCard
                    key={participant.submissionId}
                    challengeId={challengeId}
                    participant={participant}
                    votingAccess={payload.votingAccess}
                    predictionAccess={payload.predictionAccess}
                    returnPath={returnPath}
                    onVoteRecorded={async () => {
                      await Promise.all([
                        queryClient.invalidateQueries({ queryKey: ["challenge-voting-participants", challengeId, auth.user?.uid ?? "signed-out"] }),
                        queryClient.invalidateQueries({ queryKey: ["challenge-leaderboard-preview", challengeId] }),
                        queryClient.invalidateQueries({ queryKey: ["challenge-details", challengeId] })
                      ]);
                    }}
                  />)}
                </div>
                {hasMore ? <button type="button" className="mt-5 min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? "Loading entries…" : "Load more eligible entries"}</button> : null}
              </>}
          <LinkButton href={`/challenges/${challengeId}`} className="mt-8" variant="secondary">Return to Challenge</LinkButton>
        </Card>
      </div>
    </AppShell>
  );
}
