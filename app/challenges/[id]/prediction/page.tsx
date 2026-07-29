"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, DollarSign, ExternalLink, Search, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { SubmissionMediaFrame } from "@/components/media-display";
import { apiRequest } from "@/lib/api/client";
import { formatChallengeDateTime } from "@/lib/challenge-date-time";
import type { PublicChallengeParticipant } from "@/lib/server/challenge-participants";
import type { PublicPredictionAccess } from "@/components/challenge-participant-card";

type PredictionRecord = {
  id: string;
  predictedSubmissionId: string;
  stakeAmountCents: number;
  currency: string;
  status: string;
  paymentStatus: string;
  predictionClosesAt: string;
  rewardAmountCents?: number | null;
};

type PredictionStatusResponse = {
  feature: {
    name: string;
    platformFeeRate: number;
    predictionPaymentsProvider: string;
    realMoneyOnly: boolean;
    dorocoinAllowed: false;
    externalPayoutsEnabled: false;
  };
  access: PublicPredictionAccess & { closesAt: string | null; eligibleSubmissionCount: number; rankingOnly: boolean };
  prediction: PredictionRecord | null;
};

type ParticipantsResponse = {
  challenge: { id: string; title?: string; timezone?: string; timeZone?: string };
  participants: PublicChallengeParticipant[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
  predictionAccess: PredictionStatusResponse["access"];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, cents) / 100);
}

export default function ChallengePredictionPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const challengeId = params.id;
  const requestedSubmissionId = searchParams.get("submissionId") ?? "";
  const paymentReturn = searchParams.get("payment");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(requestedSubmissionId);
  const [stake, setStake] = useState("10");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["prediction-status", challengeId],
    queryFn: () => apiRequest<PredictionStatusResponse>(`/api/predictions?challengeId=${encodeURIComponent(challengeId)}`),
    enabled: Boolean(challengeId),
    refetchInterval: (query) => {
      const prediction = query.state.data?.ok ? query.state.data.data?.prediction : null;
      return paymentReturn === "processing" && prediction?.status === "pending_payment" ? 2500 : false;
    },
    staleTime: 10_000
  });
  const participantsQuery = useQuery({
    queryKey: ["prediction-participants", challengeId, search, page],
    queryFn: () => apiRequest<ParticipantsResponse>(`/api/challenges/${challengeId}/participants?search=${encodeURIComponent(search)}&sort=highest_votes&page=${page}&pageSize=12`),
    enabled: Boolean(challengeId),
    staleTime: 10_000
  });
  const statusPayload = statusQuery.data?.ok ? statusQuery.data.data : null;
  const participantPayload = participantsQuery.data?.ok ? participantsQuery.data.data : null;
  const access = statusPayload?.access ?? participantPayload?.predictionAccess;
  const prediction = statusPayload?.prediction;
  const participants = useMemo(() => participantPayload?.participants ?? [], [participantPayload?.participants]);
  const selected = participants.find((item) => item.submissionId === selectedSubmissionId);
  const amountCents = Math.round((Number(stake) || 0) * 100);
  const platformFeeCents = Math.round(amountCents * 0.07);
  const netPoolContributionCents = Math.max(0, amountCents - platformFeeCents);
  const timeZone = participantPayload?.challenge.timezone ?? participantPayload?.challenge.timeZone ?? "Africa/Lagos";

  useEffect(() => {
    if (requestedSubmissionId) setSelectedSubmissionId(requestedSubmissionId);
  }, [requestedSubmissionId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!access?.authenticated) {
      window.location.href = access?.loginPath || `/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}/prediction`)}`;
      return;
    }
    setSubmitting(true);
    setMessage("");
    const result = await apiRequest<{ url?: string; prediction?: PredictionRecord }>("/api/predictions", {
      method: "POST",
      body: JSON.stringify({
        challengeId,
        predictedSubmissionId: selectedSubmissionId,
        stakeAmountUsd: Number(stake),
        currency: "usd",
        acceptedTerms
      })
    });
    setSubmitting(false);
    setMessage(result.message);
    if (result.ok && result.data?.url) window.location.href = result.data.url;
    else if (result.ok) void statusQuery.refetch();
  }

  if (statusQuery.isLoading || participantsQuery.isLoading) {
    return <AppShell><Card className="h-[620px] animate-pulse" /></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <PageTitle
            title="Prediction Arena"
            subtitle="Predict who you think will win before voting opens."
            icon={<Trophy />}
          />
          <LinkButton href={`/challenges/${challengeId}`} variant="secondary">Back to Challenge</LinkButton>
        </div>

        <Card className="mt-7 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-1 shrink-0 text-[var(--gold)]" />
            <div>
              <p className="font-black">{access?.message ?? "Prediction Arena status is unavailable."}</p>
              {access?.closesAt ? <p className="mt-2 text-sm text-slate-300">Predictions close {formatChallengeDateTime(access.closesAt, timeZone)}.</p> : null}
              <p className="mt-2 text-sm text-slate-400">Prediction rewards are settled after winners are approved.</p>
            </div>
          </div>
        </Card>

        {paymentReturn === "processing" && prediction?.status === "pending_payment" ? (
          <Card className="mt-6 border-yellow-500/30 p-5">
            <h2 className="text-xl font-black">Payment confirmation pending</h2>
            <p className="mt-2 text-sm text-slate-300">Your prediction is pending payment confirmation. This page will update after the provider confirms it.</p>
          </Card>
        ) : null}
        {paymentReturn === "canceled" ? (
          <Card className="mt-6 border-white/10 p-5"><p className="font-black">Prediction payment was canceled.</p><p className="mt-2 text-sm text-slate-400">No active prediction was created.</p></Card>
        ) : null}
        {prediction?.status === "active" ? (
          <Card className="mt-6 border-emerald-500/30 bg-emerald-500/5 p-5">
            <h2 className="text-xl font-black text-emerald-200">Your prediction is active.</h2>
            <p className="mt-2 text-sm text-slate-300">Prediction amount: {money(Number(prediction.stakeAmountCents ?? 0))}. Rewards are settled internally after winners are approved.</p>
          </Card>
        ) : null}

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Eligible entries</p>
                <h2 className="mt-2 text-2xl font-black">Select your predicted winner</h2>
                <p className="mt-2 text-sm text-slate-400">Rankings are shown while Prediction Arena is open. Exact vote counts remain hidden.</p>
              </div>
              <label className="relative sm:w-72">
                <span className="sr-only">Search participants</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input className={`${inputClass} pl-10`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search participants" />
              </label>
            </div>

            {participants.length ? (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {participants.map((participant) => (
                  <Card key={participant.submissionId} className={`overflow-hidden ${selectedSubmissionId === participant.submissionId ? "border-[var(--gold)]" : ""}`}>
                    <SubmissionMediaFrame src={participant.submissionMediaUrl} alt={participant.submissionTitle} className="rounded-none border-0" placeholder="Challenge entry" />
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/40">
                            {participant.avatarUrl ? <img src={participant.avatarUrl} alt={participant.displayName} className="h-full w-full object-cover" /> : <UserRound size={18} className="text-[var(--gold)]" />}
                          </div>
                          <div className="min-w-0">
                            {participant.profilePath ? <Link href={participant.profilePath} className="block truncate font-black hover:text-[var(--gold)]">{participant.displayName}</Link> : <p className="truncate font-black">{participant.displayName}</p>}
                            <p className="truncate text-xs text-slate-400">{participant.submissionTitle}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-black text-black">#{participant.rank}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <LinkButton href={participant.submissionPath} variant="ghost" className="w-full"><ExternalLink size={15} /> Entry</LinkButton>
                        <Button type="button" variant={selectedSubmissionId === participant.submissionId ? "primary" : "secondary"} className="w-full" onClick={() => setSelectedSubmissionId(participant.submissionId)} disabled={!access?.windowOpen || prediction?.status === "active"}>
                          Select
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="mt-6 border-dashed p-8 text-center text-slate-400">Prediction Arena will open when eligible submissions are available.</Card>
            )}
            {participantPayload && participantPayload.pagination.total > participantPayload.pagination.pageSize ? (
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <Button variant="secondary" disabled={!participantPayload.pagination.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            ) : null}
          </section>

          <form onSubmit={submit}>
            <Card className="sticky top-6 p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 shrink-0 text-[var(--gold)]" />
                <div><h2 className="text-xl font-black">Review prediction</h2><p className="mt-2 text-sm text-slate-400">Real money only. DoroCoins cannot be used.</p></div>
              </div>
              <div className="mt-6 space-y-5">
                <Field label="Selected participant"><input className={inputClass} value={selected?.displayName ?? "Select a participant"} readOnly /></Field>
                <Field label="Prediction amount (USD)"><input className={inputClass} type="number" min="1" max="500" step="0.01" value={stake} onChange={(event) => setStake(event.target.value)} /></Field>
              </div>
              <div className="mt-5 rounded-[8px] bg-black/30 p-4 text-sm leading-6 text-slate-300">
                <p>Confirmed prediction amount: <strong>{money(amountCents)}</strong></p>
                <p>Pool platform fee: <strong>{money(platformFeeCents)} (7%)</strong></p>
                <p>Net pool contribution: <strong>{money(netPoolContributionCents)}</strong></p>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">A 7% platform fee is deducted from the confirmed prediction pool before rewards are distributed. Correct predictors share the net pool proportionally to their confirmed prediction amount.</p>
              <label className="mt-5 flex items-start gap-3 text-sm font-bold leading-6">
                <input className="mt-1" type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
                <span>I accept the Prediction Arena terms and understand rewards are credited internally after winner approval.</span>
              </label>
              {message ? <p className="mt-4 rounded-[8px] bg-white/[0.04] p-3 text-sm text-slate-300">{message}</p> : null}
              {!access?.authenticated ? (
                <LinkButton href={access?.loginPath || `/auth/login?next=${encodeURIComponent(`/challenges/${challengeId}/prediction`)}`} className="mt-6 w-full"><DollarSign size={16} /> Log in to Predict</LinkButton>
              ) : (
                <Button className="mt-6 w-full" type="submit" disabled={!access?.canPredict || !selectedSubmissionId || amountCents < 100 || !acceptedTerms || submitting || prediction?.status === "active"}>
                  <DollarSign size={16} /> {prediction?.status === "active" ? "Prediction Active" : prediction?.status === "pending_payment" ? "Payment Pending" : submitting ? "Preparing Checkout..." : "Confirm Prediction"}
                </Button>
              )}
              {!access?.canPredict && access?.authenticated ? <p className="mt-3 text-sm text-slate-400">{access.message}</p> : null}
              <p className="mt-5 text-xs leading-5 text-slate-500">Payment confirmation comes from secure provider processing. Prediction rewards are credited internally. Withdrawals remain subject to platform review.</p>
            </Card>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
