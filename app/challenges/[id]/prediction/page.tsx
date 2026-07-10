"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Field, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Coins } from "lucide-react";

export default function ChallengePredictionPage() {
  const params = useParams<{ id: string }>();
  const [participantId, setParticipantId] = useState("");
  const [stake, setStake] = useState("100");
  const [message, setMessage] = useState("");
  const platformFee = Math.floor(Number(stake || 0) * 0.07);
  async function submit() {
    const result = await apiRequest("/api/predictions", { method: "POST", body: JSON.stringify({ challengeId: params.id, predictedParticipantId: participantId, stakeAmountDorocoin: Number(stake) }) });
    setMessage(result.message);
  }
  return (
    <AppShell>
      <Card className="mx-auto max-w-3xl p-6 sm:p-8 lg:p-10">
        <PageTitle title="Prediction Arena" subtitle="DoroCoin-only challenge prediction foundation. This is not cash wagering and no rewards settle automatically." icon={<Coins />} />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Field label="Predicted participant ID"><input className={inputClass} value={participantId} onChange={(event) => setParticipantId(event.target.value)} /></Field>
          <Field label="DoroCoin stake"><input className={inputClass} type="number" min="1" value={stake} onChange={(event) => setStake(event.target.value)} /></Field>
        </div>
        <Card className="mt-6 border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">Platform fee: {platformFee} DoroCoins. Net pool: {Math.max(0, Number(stake || 0) - platformFee)} DoroCoins. Settlement waits for final winner lock and admin review.</Card>
        {message ? <p className="mt-5 rounded-[8px] bg-emerald-950/30 p-4 text-sm text-emerald-100">{message}</p> : null}
        <div className="mt-7 flex flex-wrap gap-3"><Button onClick={submit}>Record Prediction</Button><LinkButton href={`/challenges/${params.id}`} variant="secondary">Back to Challenge</LinkButton></div>
      </Card>
    </AppShell>
  );
}
