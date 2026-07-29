"use client";

import { useQuery } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Prediction = {
  id: string;
  challengeId: string;
  stakeAmountCents: number;
  currency: string;
  status: string;
  paymentStatus: string;
  rewardAmountCents?: number | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, cents) / 100);
}

export default function PredictionArenaPage() {
  const query = useQuery({
    queryKey: ["my-predictions"],
    queryFn: () => apiRequest<{ predictions: Prediction[] }>("/api/predictions"),
    staleTime: 20_000
  });
  const predictions = query.data?.ok ? query.data.data?.predictions ?? [] : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageTitle title="Prediction Arena" subtitle="Track your confirmed and pending challenge predictions." icon={<DollarSign />} />
        <Card className="mt-7 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-5 text-sm leading-6 text-slate-300">
          Predictions close when voting opens. A 7% platform fee is deducted from the confirmed prediction pool before rewards are distributed. Rewards are credited internally after winners are approved.
        </Card>
        {query.isLoading ? <Card className="mt-7 h-72 animate-pulse" /> : predictions.length ? (
          <div className="mt-7 grid gap-4">
            {predictions.map((prediction) => (
              <Card key={prediction.id} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{String(prediction.status).replaceAll("_", " ")}</p>
                    <h2 className="mt-2 text-xl font-black">Challenge prediction</h2>
                    <p className="mt-2 text-sm text-slate-400">Prediction amount: {money(Number(prediction.stakeAmountCents ?? 0))} / Payment: {String(prediction.paymentStatus ?? "pending").replaceAll("_", " ")}</p>
                    {Number(prediction.rewardAmountCents ?? 0) > 0 ? <p className="mt-2 text-sm font-bold text-emerald-300">Internal reward: {money(Number(prediction.rewardAmountCents))}</p> : null}
                  </div>
                  <LinkButton href={`/challenges/${encodeURIComponent(prediction.challengeId)}/prediction`} variant="secondary">View Prediction</LinkButton>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-7 border-dashed">
            <EmptyState icon={<DollarSign />} title="No predictions yet" body="Eligible challenge predictions will appear here after you create them." action={<LinkButton href="/explore">Explore Challenges</LinkButton>} />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
