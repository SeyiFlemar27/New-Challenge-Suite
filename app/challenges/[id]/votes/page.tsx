"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, LinkButton, PageTitle } from "@/components/ui";
import { fetchChallengeDetails, voteForSubmission } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { SubmissionMediaFrame } from "@/components/media-display";

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
  const votingAccess = (details as any)?.userState?.votingAccess as { authenticated?: boolean; canVote?: boolean; reason?: string | null; loginPath?: string; freeVote?: { available?: boolean; used?: boolean; voteDate?: string; timeZone?: string; resetsAt?: string } } | undefined;
  const votingOpen = Boolean(phaseSummary?.votingOpen);
  const eligibleSubmissionCount = Number(phaseSummary?.eligibleSubmissionCount ?? submissions.length);
  const freeVoteUsed = Boolean(votingAccess?.freeVote?.used);
  const freeVoteResetLabel = votingAccess?.freeVote?.resetsAt
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(votingAccess.freeVote.resetsAt))
    : null;
  const voteMutation = useMutation({
    mutationFn: () => voteForSubmission({ challengeId, submissionId, voteMode: "free", quantity: 1, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async (result) => { setMessage(result.message); await queryClient.invalidateQueries({ queryKey: ["challenge-details", challengeId] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Your vote could not be recorded.")
  });
  function voteAction(sticky = false) {
    const className = sticky ? "w-full" : "mt-5 w-full";
    if (!auth.user) return <LinkButton href={`/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}/votes`)}`} className={className}>Log in to Vote</LinkButton>;
    if (votingAccess?.canVote === false) return <Button className={className} variant="secondary" disabled>{votingAccess.reason === "owner_blocked" ? "You cannot vote on your own challenge" : votingAccess.reason === "sponsor_blocked" ? "Voting unavailable for sponsor accounts" : "Voting unavailable"}</Button>;
    if (freeVoteUsed) return <Button className={className} variant="secondary" disabled>Free Vote Used Today</Button>;
    return <Button className={className} disabled={!submissionId || voteMutation.isPending} onClick={() => voteMutation.mutate()}>{voteMutation.isPending ? "Recording Vote..." : "Cast Free Vote"}</Button>;
  }

  if (auth.loading || detailsQuery.isLoading) return <AppShell><Card className="mx-auto h-64 max-w-4xl animate-pulse" /></AppShell>;
  if (!challenge) return <AppShell><Card className="mx-auto max-w-4xl p-8"><PageTitle title="Voting" subtitle="Challenge unavailable" icon={<Vote className="text-[var(--gold)]" />} /><LinkButton href="/explore" className="mt-6">Back to Explore</LinkButton></Card></AppShell>;
  return (
    <AppShell>
      <Card data-mobile-voting-page className="mx-auto max-w-4xl p-5 sm:p-8">
        <PageTitle title="Challenge Voting" subtitle={challenge.title} icon={<Vote className="text-[var(--gold)]" />} />
        {!votingOpen ? <div className="mt-8"><h2 className="text-xl font-black">Voting is not open.</h2><p className="mt-2 text-slate-300">Return when the challenge voting window opens.</p></div>
          : eligibleSubmissionCount <= 0 || !submissions.length ? <div className="mt-8"><h2 className="text-xl font-black">Voting unavailable</h2><p className="mt-2 text-slate-300">No eligible submissions are available for voting yet.</p></div>
            : <div className="mt-8">
              <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-4"><p className="font-black text-[var(--gold)]">{freeVoteUsed ? "Free vote used for today." : "Your free vote is available."}</p>{freeVoteUsed && freeVoteResetLabel ? <p className="mt-1 text-sm text-slate-400">Resets at {freeVoteResetLabel} in your saved timezone.</p> : <p className="mt-1 text-sm text-slate-400">One free vote total per challenge per local day.</p>}</div>
              <Field label="Choose an eligible submission">
                <div className="mobile-card-list mt-3 grid gap-4 sm:grid-cols-2">
                  {submissions.map((submission) => <button type="button" key={submission.id} onClick={() => setSubmissionId(submission.id)} className={`overflow-hidden rounded-[8px] border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] ${submissionId === submission.id ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-[#171717]"}`}>
                    <SubmissionMediaFrame src={submission.mediaUrl} alt={submission.title} className="aspect-[16/10] h-auto rounded-none border-0" placeholder="Challenge entry" />
                    <span className="block min-h-14 p-4 font-black">{submission.title}</span>
                  </button>)}
                </div>
                <select className="sr-only" tabIndex={-1} aria-hidden="true" value={submissionId} onChange={(event) => setSubmissionId(event.target.value)}><option value="">Select a submission</option>{submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.title}</option>)}</select>
              </Field>
              {voteAction()}
              {freeVoteUsed ? <LinkButton href={`/challenges/${challengeId}/bonus-votes`} className="mt-3 w-full" variant="secondary">Use DoroCoin Votes</LinkButton> : null}
            </div>}
        {message ? <p className="mt-4 rounded-[8px] bg-white/[0.05] p-3 text-sm text-slate-200">{message}</p> : null}
        <LinkButton href={`/challenges/${challengeId}`} className="mt-8" variant="secondary">Return to Challenge</LinkButton>
      </Card>
      {votingOpen && eligibleSubmissionCount > 0 && submissions.length ? <><div className="h-24 lg:hidden" aria-hidden="true" /><div data-mobile-sticky-cta className="mobile-sticky-action fixed inset-x-0 bottom-0 z-40 border-t border-[var(--gold)]/25 bg-[#090909]/96 px-4 pt-3 backdrop-blur lg:hidden">{voteAction(true)}</div></> : null}
    </AppShell>
  );
}
