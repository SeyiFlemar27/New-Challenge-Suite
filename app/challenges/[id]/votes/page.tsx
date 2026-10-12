"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const query = useQuery({
    queryKey: ["challenge-voting-participants", challengeId, auth.user?.uid ?? "signed-out"],
    queryFn: () => apiRequest<VotingParticipantsResponse>(`/api/challenges/${challengeId}/participants?page=1&pageSize=36&sort=highest_votes`),
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 15_000
  });
  const payload = query.data?.ok ? query.data.data : null;
  const returnPath = `/challenges/${challengeId}/votes`;

  if (auth.loading || query.isLoading) return <AppShell><Card className="mx-auto h-64 max-w-5xl animate-pulse" /></AppShell>;
  if (!payload) return <AppShell><Card className="mx-auto max-w-5xl p-8"><PageTitle title="Challenge Voting" subtitle={query.data?.message ?? "Challenge voting is unavailable."} icon={<Vote className="text-[var(--gold)]" />} /><LinkButton href={`/challenges/${challengeId}`} className="mt-6" variant="secondary">Return to Challenge</LinkButton></Card></AppShell>;

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
                  {payload.participants.map((participant) => <ChallengeParticipantCard
                    key={participant.submissionId}
                    challengeId={challengeId}
                    participant={participant}
                    votingAccess={payload.votingAccess}
                    predictionAccess={payload.predictionAccess}
                    returnPath={returnPath}
                    onVoteRecorded={() => queryClient.invalidateQueries({ queryKey: ["challenge-voting-participants", challengeId] })}
                  />)}
                </div>
                {payload.pagination.hasMore ? <LinkButton href={`/challenges/${challengeId}/participants`} className="mt-5" variant="secondary">See all eligible entries</LinkButton> : null}
              </>}
          <LinkButton href={`/challenges/${challengeId}`} className="mt-8" variant="secondary">Return to Challenge</LinkButton>
        </Card>
      </div>
    </AppShell>
  );
}
