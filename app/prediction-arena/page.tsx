"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Coins, ShieldCheck } from "lucide-react";

export default function PredictionArenaPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    apiRequest("/api/predictions").then((result) => result.ok && setData(result.data));
  }, []);
  return (
    <AppShell>
      <PageTitle title="Prediction Arena" subtitle="Use DoroCoins to predict challenge outcomes before a challenge begins. Rewards are DoroCoin-only and settlement requires admin review." icon={<Coins />} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">DoroCoin-only rules</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {["No cash predictions", "No DoroCoin-to-cash conversion", "7% DoroCoin platform fee", "Settlement after winner lock and admin review", "Age, region, and terms gate foundation", "Feature flag controlled"].map((item) => <Card key={item} className="p-4 text-sm font-bold text-slate-300"><ShieldCheck className="mb-2 text-[var(--gold)]" size={18} />{item}</Card>)}
          </div>
        </Card>
        <Card className="p-6">
          {data?.predictions?.length ? <div className="space-y-3">{data.predictions.map((item: any) => <Card key={item.id} className="p-4"><p className="font-black">{item.challengeId}</p><p className="mt-1 text-sm text-slate-400">{item.stakeAmountDorocoin} DoroCoins · {String(item.status).replaceAll("_", " ")}</p></Card>)}</div> : <EmptyState icon={<Coins />} title="No predictions yet" body="Prediction records will appear here after you enter a challenge prediction. Settlement is never automatic." action={<LinkButton href="/challenges">Find Challenges</LinkButton>} />}
        </Card>
      </div>
    </AppShell>
  );
}
