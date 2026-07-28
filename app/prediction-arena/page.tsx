"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { DollarSign, ShieldCheck } from "lucide-react";

export default function PredictionArenaPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    apiRequest("/api/predictions").then((result) => result.ok && setData(result.data));
  }, []);
  return (
    <AppShell>
      <PageTitle title="Prediction Arena" subtitle="Coming soon. Prediction Arena is compliance-gated and requires provider approval, KYC, age, region, terms, admin market approval, and settlement review before activation." icon={<DollarSign />} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Eligibility and safety gates</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {["Payment provider approval required", "KYC and age verification required", "U.S. state eligibility required", "7% Challenge Suite fee", "Settlement and refunds require admin review", "No automatic payout execution"].map((item) => <Card key={item} className="p-4 text-sm font-bold text-slate-300"><ShieldCheck className="mb-2 text-[var(--gold)]" size={18} />{item}</Card>)}
          </div>
          <p className="mt-5 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm leading-6 text-yellow-100">Prediction Arena is coming soon and remains compliance-gated. No stake, settlement, payout, prize release, or winner payment is active.</p>
        </Card>
        <Card className="p-6">
          {data?.predictions?.length ? <div className="space-y-3">{data.predictions.map((item: any) => <Card key={item.id} className="p-4"><p className="font-black">{item.challengeId}</p><p className="mt-1 text-sm text-slate-400">{String(item.settlementStatus ?? item.predictionStatus ?? "review_required").replaceAll("_", " ")} / Compliance gated</p></Card>)}</div> : <EmptyState icon={<DollarSign />} title="Prediction Arena coming soon" body="Records will appear only after eligible markets are approved and provider-gated flow is active. No stakes, settlement, or payout are shown here." action={<LinkButton href="/challenges">Find Challenges</LinkButton>} />}
        </Card>
      </div>
    </AppShell>
  );
}
