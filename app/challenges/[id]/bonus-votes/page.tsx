"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { fetchChallengeDetails, voteForSubmission } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getChallengeLifecycleState } from "@/lib/challenge-status";

export default function BonusVotesPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const challengeId = params.id;
  const auth = useAuth();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const [custom, setCustom] = useState("1");
  const [agreed, setAgreed] = useState(false);
  const [largeSpendConfirmed, setLargeSpendConfirmed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [submissionId, setSubmissionId] = useState(() => searchParams.get("submissionId") ?? "");

  const detailsQuery = useQuery({
    queryKey: ["challenge-details", challengeId, auth.user?.uid ?? "signed-out"],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 30_000
  });
  const details = detailsQuery.data?.ok ? detailsQuery.data.data : null;
  const challenge = useMemo(() => details?.challenge ? normalizeChallenge(details.challenge as ChallengeApiRecord) : null, [details?.challenge]);
  const submissions = useMemo(() => {
    if (!challenge) return [];
    const voteEligibleStatuses = new Set(["active", "approved", "winner"]);
    return (details?.submissions ?? [])
      .filter((item) => voteEligibleStatuses.has(String((item as Record<string, unknown>).status ?? "")))
      .map((item) => normalizeSubmission(item as SubmissionApiRecord, challenge))
      .filter((item) => item.id);
  }, [challenge, details?.submissions]);
  const votes = Number(custom || 0);
  const coins = votes * 5;
  const lifecycle = challenge ? getChallengeLifecycleState(challenge) : null;
  const phaseSummary = (details as any)?.phaseSummary as { votingOpen?: boolean; eligibleSubmissionCount?: number | null } | undefined;
  const votingOpen = Boolean(phaseSummary?.votingOpen);
  const eligibleSubmissionCount = Number(phaseSummary?.eligibleSubmissionCount ?? submissions.length);
  const walletBalance = currentUser.user?.doroBalance ?? 0;

  const voteMutation = useMutation({
    mutationFn: async (mode: "free" | "dorocoin") => {
      if (!submissionId) throw new Error("Select a submission to vote for.");
      const quantity = mode === "free" ? 1 : votes;
      const result = await voteForSubmission({
        challengeId,
        submissionId,
        voteMode: mode,
        quantity,
        idempotencyKey: crypto.randomUUID(),
        confirmedLargeSpend: mode !== "dorocoin" || quantity < 50 || largeSpendConfirmed
      });
      if (!result.ok) throw new Error(result.message);
      return { ...result.data, mode };
    },
    onSuccess: async (result) => {
      const recorded = Number(result?.quantity ?? (result?.mode === "free" ? 1 : votes));
      const spent = Number(result?.coinCost ?? 0);
      setSuccessMessage(result?.mode === "free"
        ? "Your free daily vote was recorded."
        : `${recorded} vote${recorded === 1 ? "" : "s"} were recorded. ${spent} DoroCoin${spent === 1 ? "" : "s"} spent.`);
      setSuccess(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["challenge-details", challengeId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["current-user"] })
      ]);
    },
    onError: (caught) => {
      const message = caught instanceof Error ? caught.message : "Votes could not be recorded.";
      setError(message);
    }
  });

  function purchase() {
    setError("");
    if (!auth.user) {
      setError("Sign in before voting.");
      return;
    }
    if (!agreed) {
      setError("Accept the DoroCoin voting agreement to continue.");
      return;
    }
    if (!votingOpen) {
      setError(lifecycle?.disabledReason ?? lifecycle?.userFacingMessage ?? "Voting is closed for this challenge.");
      return;
    }
    if (!votes || votes < 1) {
      setError("Select a valid vote amount.");
      return;
    }
    if (votes > 100) {
      setError("You can cast up to 100 DoroCoin votes per transaction.");
      return;
    }
    if (votes >= 50 && !largeSpendConfirmed) {
      setError("Confirm this unusually large DoroCoin spend to continue.");
      return;
    }
    if (coins > walletBalance) {
      setError("Insufficient DoroCoin balance.");
      return;
    }
    voteMutation.mutate("dorocoin");
  }

  if (auth.loading || detailsQuery.isLoading || currentUser.loading) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-4xl p-5 sm:p-8">
          <div className="h-12 max-w-lg animate-pulse rounded bg-[#1a1a1a]" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-32 animate-pulse bg-[#151515]" />)}</div>
        </Card>
      </AppShell>
    );
  }

  if (detailsQuery.data && !detailsQuery.data.ok) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-4xl p-5 sm:p-8">
          <PageTitle title="DoroCoin Bonus Votes" subtitle="Challenge unavailable" icon={<Vote className="text-[var(--gold)]" />} />
          <p className="mt-6 rounded-[8px] bg-red-950/50 p-3 text-red-200">{detailsQuery.data.message}</p>
          <LinkButton href="/challenges" className="mt-8 w-full sm:w-auto">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-4xl p-5 sm:p-8">
          <PageTitle title="DoroCoin Bonus Votes" subtitle="Challenge not found" icon={<Vote className="text-[var(--gold)]" />} />
          <LinkButton href="/challenges" className="mt-8 w-full sm:w-auto">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!votingOpen) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-4xl p-5 sm:p-8">
          <PageTitle title="Bonus Votes" subtitle={challenge.title} icon={<Vote className="text-[var(--gold)]" />} />
          <h2 className="mt-8 text-xl font-black">Bonus votes are not available yet.</h2>
          <p className="mt-3 text-slate-300">Voting must open before DoroCoin bonus votes can be used.</p>
          <LinkButton href={`/challenges/${challenge.id}`} className="mt-8">Return to Challenge</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (eligibleSubmissionCount <= 0 || !submissions.length) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-4xl p-5 sm:p-8">
          <PageTitle title="Bonus Votes" subtitle={challenge.title} icon={<Vote className="text-[var(--gold)]" />} />
          <h2 className="mt-8 text-xl font-black">No eligible submissions are available for bonus votes yet.</h2>
          <LinkButton href={`/challenges/${challenge.id}`} className="mt-8">Return to Challenge</LinkButton>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card className="mx-auto max-w-4xl p-5 sm:p-8">
        <PageTitle title="DoroCoin Bonus Votes" subtitle={challenge.title} icon={<Vote className="text-[var(--gold)]" />} />
        {success ? (
          <div className="mt-8 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400 sm:h-20 sm:w-20" />
            <h2 className="mt-5 text-2xl font-black sm:text-3xl">DoroCoin Votes Recorded</h2>
            <p className="mt-3 text-slate-300">{successMessage}</p>
            <LinkButton href={`/challenges/${challenge.id}`} className="mt-8 w-full sm:w-auto">Return to Challenge</LinkButton>
          </div>
        ) : (
          <>
            {!auth.user ? <p className="mt-6 rounded-[8px] bg-red-950/50 p-3 text-red-200">Sign in before voting.</p> : null}
            <div className="mt-8"><Field label="Additional vote quantity"><input className={inputClass} type="number" min="1" max="100" value={custom} onChange={(event) => { setCustom(event.target.value); setLargeSpendConfirmed(false); }} /></Field><p className="mt-2 text-sm text-slate-400">5 DoroCoins per additional vote. You can vote again in separate transactions and distribute votes across eligible participants.</p></div>
            <div className="mt-6">
              <Field label="Vote For Submission">
                <select className={inputClass} value={submissionId} onChange={(event) => setSubmissionId(event.target.value)}>
                  <option value="">Select a submission</option>
                  {submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.title} - {submission.likes} votes</option>)}
                </select>
              </Field>
            </div>
            <Card className="mt-6 bg-black/30 p-4 sm:p-5">
              <p><b>Wallet:</b> {walletBalance} DoroCoins</p>
              <p className="mt-2"><b>Selected participant:</b> {submissions.find((submission) => submission.id === submissionId)?.title ?? "None selected"}</p>
              <p className="mt-2"><b>Total:</b> {votes || 0} votes x 5 DoroCoins = {coins || 0} DoroCoins</p>
            </Card>
            <Card className="mt-6 border-yellow-500/20 bg-yellow-500/[0.04] p-4 sm:p-5">
              <h2 className="text-lg font-black">Paid Vote Checkout</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Card-based paid vote credits are granted only after Stripe webhook confirmation and cannot be granted from the success page.</p>
              <Button className="mt-4 w-full" variant="secondary" disabled title="Paid vote checkout requires payment setup and challenge-level paid vote activation">Paid votes setup required</Button>
            </Card>
            <label className="mt-6 flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> <span>I acknowledge DoroCoin votes are final once recorded and are subject to the voting policy. DoroCoin is an internal platform credit, not cash.</span></label>
            {votes >= 50 ? <label className="mt-4 flex items-start gap-3 rounded-[8px] border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={largeSpendConfirmed} onChange={(event) => setLargeSpendConfirmed(event.target.checked)} /> <span>Confirm spending {coins} DoroCoins on this unusually large vote request.</span></label> : null}
            {error ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <Button className="mt-6 w-full" onClick={purchase} disabled={!auth.user || !votingOpen || !submissions.length || voteMutation.isPending}>{voteMutation.isPending ? "Recording Votes" : "Confirm DoroCoin Votes"}</Button>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LinkButton href={`/dorocoins?returnTo=${encodeURIComponent(`/challenges/${challengeId}/bonus-votes?submissionId=${submissionId}`)}`} variant="secondary" className="w-full">Buy DoroCoins</LinkButton>
              <Button variant="secondary" className="w-full" disabled title="A verified Google Ad Manager rewarded-ad callback is required before bonus votes can be granted"><PlayCircle size={18} /> Ads for votes are not available yet</Button>
            </div>
            <p className="mt-3 text-sm text-slate-400">Earn 3 DoroCoins per completed verified ad. Up to 10 verified ads are available per cycle, followed by a 2-hour cooldown. Ads are unavailable until a server-verified provider is configured.</p>
          </>
        )}
      </Card>
    </AppShell>
  );
}




