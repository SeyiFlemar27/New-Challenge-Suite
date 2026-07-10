"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { fetchChallengeDetails, fetchVotePackages, voteForSubmission } from "@/lib/api/services";
import { normalizeChallenge, normalizeSubmission, type ChallengeApiRecord, type SubmissionApiRecord } from "@/lib/api/normalizers";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canVoteOnChallenge } from "@/lib/challenge-status";

type VotePackage = {
  id: string;
  label?: string;
  name?: string;
  votes?: number;
  coins?: number;
};

export default function PurchaseVotesPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [freeVoteUsed, setFreeVoteUsed] = useState(false);

  const detailsQuery = useQuery({
    queryKey: ["challenge-details", challengeId, auth.user?.uid ?? "signed-out"],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 30_000
  });
  const packagesQuery = useQuery({
    queryKey: ["vote-packages"],
    queryFn: fetchVotePackages,
    staleTime: 60_000
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
  const votePackages = useMemo(() => {
    const records = packagesQuery.data?.ok ? packagesQuery.data.data?.packages ?? [] : [];
    return records.map((item) => item as VotePackage).filter((item) => item.id && Number(item.votes ?? 0) > 0 && Number(item.coins ?? 0) > 0);
  }, [packagesQuery.data]);
  const selectedId = selected || votePackages[0]?.id || "custom";
  const pack = votePackages.find((item) => item.id === selectedId);
  const votes = selectedId === "custom" ? Number(custom || 0) : Number(pack?.votes ?? 0);
  const coins = selectedId === "custom" ? votes : Number(pack?.coins ?? 0);
  const votingOpen = challenge ? canVoteOnChallenge(challenge) : false;
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
        idempotencyKey: crypto.randomUUID()
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
      if (message.toLowerCase().includes("1 vote per challenge/day")) setFreeVoteUsed(true);
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
      setError("Voting is closed for this challenge.");
      return;
    }
    if (!votes || votes < 1) {
      setError("Select a valid vote amount.");
      return;
    }
    if (coins > walletBalance) {
      setError("Insufficient DoroCoin balance.");
      return;
    }
    voteMutation.mutate("dorocoin");
  }

  function useFreeVote() {
    setError("");
    if (!auth.user) return setError("Sign in before voting.");
    if (!submissionId) return setError("Select a submission to vote for.");
    if (!votingOpen) return setError("Voting is closed for this challenge.");
    voteMutation.mutate("free");
  }

  if (auth.loading || detailsQuery.isLoading || packagesQuery.isLoading || currentUser.loading) {
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
          <PageTitle title="Record Additional DoroCoin Votes" subtitle="Challenge unavailable" icon={<Vote className="text-[var(--gold)]" />} />
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
          <PageTitle title="Record Additional DoroCoin Votes" subtitle="Challenge not found" icon={<Vote className="text-[var(--gold)]" />} />
          <LinkButton href="/challenges" className="mt-8 w-full sm:w-auto">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card className="mx-auto max-w-4xl p-5 sm:p-8">
        <PageTitle title="Record Additional DoroCoin Votes" subtitle={challenge.title} icon={<Vote className="text-[var(--gold)]" />} />
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
            {!votingOpen ? <p className="mt-6 rounded-[8px] bg-red-950/50 p-3 text-red-200">Voting is closed for this challenge.</p> : null}
            {!submissions.length ? <p className="mt-6 rounded-[8px] bg-[#151515] p-3 text-slate-300">No active or approved submissions are available for voting yet.</p> : null}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {votePackages.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`min-h-28 rounded-[8px] border p-4 text-left sm:p-5 ${selectedId === item.id ? "border-yellow-400 bg-yellow-500/10" : "border-white/10 bg-[#151515]"}`}><h3 className="break-words text-lg font-black sm:text-xl">{item.label ?? item.name ?? `${item.votes} votes`}</h3><p className="mt-3 text-[var(--gold)]">{item.coins} DoroCoins</p></button>)}
              <button onClick={() => setSelected("custom")} className={`min-h-28 rounded-[8px] border p-4 text-left sm:p-5 ${selectedId === "custom" ? "border-yellow-400 bg-yellow-500/10" : "border-white/10 bg-[#151515]"}`}><h3 className="text-lg font-black sm:text-xl">Custom</h3><p className="mt-3 text-slate-300">Choose amount</p></button>
            </div>
            {selectedId === "custom" ? <div className="mt-6"><Field label="Custom Vote Amount"><input className={inputClass} type="number" min="1" value={custom} onChange={(event) => setCustom(event.target.value)} /></Field></div> : null}
            <div className="mt-6">
              <Field label="Vote For Submission">
                <select className={inputClass} value={submissionId} onChange={(event) => setSubmissionId(event.target.value)}>
                  <option value="">Select a submission</option>
                  {submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.title} - {submission.likes} votes</option>)}
                </select>
              </Field>
            </div>
            <Card className="mt-6 border-[var(--gold)]/30 bg-[var(--gold)]/5 p-5">
              <h2 className="text-xl font-black">Your daily vote</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Every user receives one free vote per challenge each day. The server enforces the daily limit.</p>
              {freeVoteUsed ? <p className="mt-4 rounded-[8px] bg-amber-950/40 p-3 text-sm font-bold text-amber-200">You&apos;ve used your free vote for today. Use DoroCoins, buy DoroCoins, or return when the daily limit resets.</p> : null}
              <Button className="mt-4 w-full sm:w-auto" variant="secondary" onClick={useFreeVote} disabled={!auth.user || !votingOpen || !submissions.length || voteMutation.isPending}>
                {voteMutation.isPending ? "Recording Vote..." : "Use Free Daily Vote"}
              </Button>
            </Card>
            <Card className="mt-6 bg-black/30 p-4 sm:p-5">
              <p><b>Wallet:</b> {walletBalance} DoroCoins</p>
              <p className="mt-2"><b>DoroCoin vote request:</b> {votes || 0} votes for {coins || 0} DoroCoins</p>
            </Card>
            <label className="mt-6 flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> <span>I acknowledge DoroCoin votes are final once recorded and are subject to the voting policy. DoroCoin is an internal platform credit, not cash.</span></label>
            {packagesQuery.data && !packagesQuery.data.ok ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-red-200">{packagesQuery.data.message}</p> : null}
            {error ? <p className="mt-4 rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <Button className="mt-6 w-full" onClick={purchase} disabled={!auth.user || !votingOpen || !submissions.length || voteMutation.isPending}>{voteMutation.isPending ? "Recording Votes" : "Confirm DoroCoin Votes"}</Button>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LinkButton href="/wallet" variant="secondary" className="w-full">Buy DoroCoins</LinkButton>
              <Button variant="secondary" className="w-full" disabled title="A verified ad provider is required before bonus votes can be granted"><PlayCircle size={18} /> Watch Ad for Vote</Button>
            </div>
            <p className="mt-3 text-sm text-slate-400">Ads for votes are not available yet. A future verified provider callback may grant one limited vote credit after completed ad verification; this page does not grant votes from a client-only button.</p>
          </>
        )}
      </Card>
    </AppShell>
  );
}


