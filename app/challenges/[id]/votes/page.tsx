"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { fetchChallengeDetails, voteForSubmission } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";

export default function ChallengeVotingPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [submissionId, setSubmissionId] = useState("");
  const [message, setMessage] = useState("");
  const detailsQuery = useQuery({ queryKey: ["challenge-details", challengeId, auth.user?.uid ?? "signed-out"], queryFn: () => fetchChallengeDetails(challengeId), enabled: Boolean(challengeId) && !auth.loading, staleTime: 15_000 });
  const details = detailsQuery.data?.ok ? detailsQuery.data.data : null;
  const challenge = useMemo(() => details?.challenge ? normalizeChallenge(details.challenge as ChallengeApiRecord) : null, [details?.challenge]);
  const submissions = useMemo(() => challenge ? (details?.submissions ?? []).map((item) => normalizeSubmission(item as SubmissionApiRecord, challenge)).filter((item) => item.id) : [], [challenge, details?.submissions]);
  const phaseSummary = (details as any)?.phaseSummary as { votingOpen?: boolean; eligibleSubmissionCount?: number | null } | undefined;
  const votingOpen = Boolean(phaseSummary?.votingOpen);
  const eligibleSubmissionCount = Number(phaseSummary?.eligibleSubmissionCount ?? submissions.length);
  const voteMutation = useMutation({
    mutationFn: () => voteForSubmission({ challengeId, submissionId, voteMode: "free", quantity: 1, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async (result) => { setMessage(result.message); await queryClient.invalidateQueries({ queryKey: ["challenge-details", challengeId] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Your vote could not be recorded.")
  });

  if (auth.loading || detailsQuery.isLoading) return <AppShell><Card className="mx-auto h-64 max-w-4xl animate-pulse" /></AppShell>;
  if (!challenge) return <AppShell><Card className="mx-auto max-w-4xl p-8"><PageTitle title="Voting" subtitle="Challenge unavailable" icon={<Vote className="text-[var(--gold)]" />} /><LinkButton href="/explore" className="mt-6">Back to Explore</LinkButton></Card></AppShell>;
  return (
    <AppShell>
      <Card className="mx-auto max-w-4xl p-5 sm:p-8">
        <PageTitle title="Challenge Voting" subtitle={challenge.title} icon={<Vote className="text-[var(--gold)]" />} />
        {!votingOpen ? <div className="mt-8"><h2 className="text-xl font-black">Voting is not open.</h2><p className="mt-2 text-slate-300">Return when the challenge voting window opens.</p></div>
          : eligibleSubmissionCount <= 0 || !submissions.length ? <div className="mt-8"><h2 className="text-xl font-black">Voting unavailable</h2><p className="mt-2 text-slate-300">No eligible submissions are available for voting yet.</p></div>
            : <div className="mt-8"><Field label="Vote for submission"><select className={inputClass} value={submissionId} onChange={(event) => setSubmissionId(event.target.value)}><option value="">Select a submission</option>{submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.title}</option>)}</select></Field><Button className="mt-5 w-full" disabled={!auth.user || !submissionId || voteMutation.isPending} onClick={() => voteMutation.mutate()}>{voteMutation.isPending ? "Recording Vote..." : "Use Free Daily Vote"}</Button><LinkButton href={`/challenges/${challengeId}/bonus-votes`} className="mt-3 w-full" variant="secondary">DoroCoin Bonus Votes</LinkButton></div>}
        {message ? <p className="mt-4 rounded-[8px] bg-white/[0.05] p-3 text-sm text-slate-200">{message}</p> : null}
        <LinkButton href={`/challenges/${challengeId}`} className="mt-8" variant="secondary">Return to Challenge</LinkButton>
      </Card>
    </AppShell>
  );
}
