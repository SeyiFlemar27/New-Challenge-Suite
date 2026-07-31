"use client";

import { useEffect, useState } from "react";
import { Gift, History, ShoppingCart, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Summary = any;

export default function RewardsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest<Summary>("/api/rewards/summary").then((result) => result.ok ? setData(result.data ?? null) : setMessage(result.message));
  }, []);

  const points = Number(data?.availableRewardPoints ?? data?.points ?? 0);
  const lifetime = Number(data?.lifetimeRewardPoints ?? points);
  const credits = data?.spinCreditsByTier ?? { basic: 0, standard: 0, premium: 0 };
  const availableSpins = Number(credits.basic ?? 0) + Number(credits.standard ?? 0) + Number(credits.premium ?? 0);
  const setupRequired = Boolean(data?.prizeSetupRequired);

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Voter Rewards" subtitle="Track real reward points, available spins, and confirmed reward activity." icon={<Gift className="text-[var(--gold)]" />} />
        <div className="flex flex-col gap-3 sm:flex-row xl:pt-2">
          <LinkButton href="/rewards/history" variant="secondary" className="justify-center"><History size={17} /> Reward History</LinkButton>
          <LinkButton href="/rewards/wheel" className="justify-center"><Trophy size={17} /> Open Spin Wheel</LinkButton>
        </div>
      </div>

      {message ? <Card className="mt-6 border-yellow-500/20 p-4 text-yellow-100">{message}</Card> : null}
      {!data && !message ? <div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-32 animate-pulse" />)}</div> : null}

      {data ? <>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Metric label="Available Points" value={points.toLocaleString()} />
          <Metric label="Lifetime Points" value={lifetime.toLocaleString()} />
          <Metric label="Available Spins" value={availableSpins.toLocaleString()} />
        </div>

        {points <= 0 && availableSpins <= 0 ? <Card className="mt-8 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-2xl font-black"><Gift className="text-[var(--gold)]" /> No reward activity yet</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Your reward points and spin history will appear here after eligible activity.</p>
          <div className="mt-5 flex flex-wrap gap-3"><LinkButton href="/dorocoins"><ShoppingCart size={17} /> Buy DoroCoins</LinkButton></div>
        </Card> : null}

        {setupRequired ? <Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-6">
          <h2 className="text-xl font-black text-yellow-100">Reward Wheel Setup Required</h2>
          <p className="mt-2 text-sm leading-6 text-yellow-50/80">Reward points can still be tracked. Prize setup is required before spins are available.</p>
          <LinkButton href="/rewards/wheel" variant="secondary" className="mt-4">Open Spin Wheel</LinkButton>
        </Card> : null}

        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="text-2xl font-black">Reward tiers</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">{[{ id: "basic", label: "Basic", threshold: 150, cost: 50 }, { id: "standard", label: "Standard", threshold: 270, cost: 70 }, { id: "premium", label: "Premium", threshold: 390, cost: 150 }].map((tier) => <Card key={tier.id} className="bg-black/30 p-4"><p className="font-black">{tier.label}</p><p className="mt-2 text-sm text-slate-400">Unlocks at {tier.threshold} points.</p><p className="mt-2 text-sm font-bold text-[var(--gold)]">{tier.cost} points per spin</p></Card>)}</div>
          <div className="mt-7 flex flex-wrap gap-3"><LinkButton href="/rewards/wheel"><Trophy size={17} /> Open Spin Wheel</LinkButton><LinkButton href="/dorocoins" variant="secondary"><ShoppingCart size={17} /> DoroCoin Activity</LinkButton></div>
        </Card>
      </> : null}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-[var(--gold-2)]">{value}</p></Card>;
}
