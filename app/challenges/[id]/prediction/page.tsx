"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { fetchChallengeDetails } from "@/lib/api/services";
import { Coins } from "lucide-react";

export default function ChallengePredictionPage() {
  const params = useParams<{ id: string }>();
  const [participantId, setParticipantId] = useState("");
  const [stake, setStake] = useState("100");
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const detailsQuery = useQuery({ queryKey: ["challenge-details", params.id, "prediction"], queryFn: () => fetchChallengeDetails(params.id), enabled: Boolean(params.id), staleTime: 30_000 });
  const details = detailsQuery.data?.ok ? detailsQuery.data.data as any : null;
  const participants = useMemo(() => details?.participants ?? [], [details?.participants]);
  const platformFee = Math.floor(Number(stake || 0) * 0.07);
  const netPool = Math.max(0, Number(stake || 0) - platformFee);
  async function submit() {
    if (!accepted) return setMessage("Accept the Prediction Arena rules before submitting.");
    const result = await apiRequest("/api/predictions", { method: "POST", body: JSON.stringify({ challengeId: params.id, predictedParticipantId: participantId, stakeAmountDorocoin: Number(stake) }) });
    setMessage(result.message);
  }
  return (
    <AppShell>
      <Card className="mx-auto max-w-3xl p-6 sm:p-8 lg:p-10">
        <PageTitle title="Prediction Arena" subtitle="DoroCoin-only challenge prediction. This is not cash wagering and no rewards settle automatically." icon={<Coins />} />
        {detailsQuery.data && !detailsQuery.data.ok ? <p className="mt-6 rounded-[8px] bg-red-950/50 p-4 text-red-200">{detailsQuery.data.message}</p> : null}
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Field label="Predict Winner"><select className={inputClass} value={participantId} onChange={(event) => setParticipantId(event.target.value)}><option value="">Select participant</option>{participants.map((participant: any) => <option key={participant.id} value={participant.id}>{participant.displayName ?? participant.username ?? participant.id}</option>)}</select></Field>
          <Field label="DoroCoin stake"><input className={inputClass} type="number" min="1" value={stake} onChange={(event) => setStake(event.target.value)} /></Field>
        </div>
        <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Platform fee: {platformFee} DoroCoins. Net pool: {netPool} DoroCoins. Predictions close before challenge start, require eligibility, and settle only after result lock and admin review.</Card>
        <label className="mt-5 flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> <span>I understand Prediction Arena uses DoroCoins only, has no cash payout, and settlement is not automatic.</span></label>
        {message ? <p className="mt-5 rounded-[8px] bg-emerald-950/30 p-4 text-sm text-emerald-100">{message}</p> : null}
        <div className="mt-7 flex flex-wrap gap-3"><Button onClick={submit} disabled={!participantId || Number(stake) <= 0}>Record Prediction</Button><LinkButton href={`/challenges/${params.id}`} variant="secondary">Back to Challenge</LinkButton></div>
      </Card>
    </AppShell>
  );
}
