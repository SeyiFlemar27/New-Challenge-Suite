"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Gift, Sparkles } from "lucide-react";

export default function RewardsPage() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest("/api/rewards").then((result) => result.ok ? setData(result.data) : setMessage(result.message));
  }, []);
  const points = Number(data?.points ?? 0);
  const credits = data?.spinCreditsByTier ?? { basic: 0, standard: 0, premium: 0 };
  const tiers = data?.tiers ?? [];
  const nextTier = useMemo(() => tiers.find((tier: any) => points < Number(tier.pointsRequired)), [tiers, points]);
  const recent = data?.history?.slice?.(0, 4) ?? [];
  return (
    <AppShell>
      <PageTitle title="Voter Rewards" subtitle="Earn Voter Points from server-confirmed DoroCoin purchases, unlock spin credits, and track reward fulfillment." icon={<Gift />} />
      {message ? <Card className="mt-6 border-yellow-500/20 p-4 text-yellow-100">{message}</Card> : null}
      <div className="mt-8 grid gap-6 lg:grid-cols-4">
        <Metric label="Total Points" value={points.toLocaleString()} />
        <Metric label="Basic Spins" value={String(credits.basic ?? 0)} />
        <Metric label="Standard Spins" value={String(credits.standard ?? 0)} />
        <Metric label="Premium Spins" value={String(credits.premium ?? 0)} />
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_380px]">
        <Card className="p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-2xl font-black"><Sparkles className="text-[var(--gold)]" /> Tier Progress</h2>
          {nextTier ? <div className="mt-6"><div className="flex items-center justify-between gap-4 text-sm font-bold"><span>{points.toLocaleString()} points</span><span>{nextTier.pointsRequired.toLocaleString()} for {nextTier.label}</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(100, Math.round(points / Number(nextTier.pointsRequired) * 100))}%` }} /></div><p className="mt-4 rounded-[8px] bg-[var(--gold)]/10 p-4 text-sm font-bold text-[var(--gold)]">You need {(Number(nextTier.pointsRequired) - points).toLocaleString()} points to unlock your next {nextTier.label} spin.</p></div> : <p className="mt-5 rounded-[8px] bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">All current tiers reached. Future DoroCoin purchases continue adding lifetime points.</p>}
          <div className="mt-7 grid gap-4 sm:grid-cols-3">{tiers.map((tier: any) => <Card key={tier.id} className="bg-black/30 p-4"><p className="font-black">{tier.label}</p><p className="mt-2 text-sm text-slate-400">{tier.pointsRequired} points = {tier.spinCredits} {tier.spinTier} spin</p></Card>)}</div>
          <LinkButton href="/rewards/wheel" className="mt-7">Open Spin Wheel</LinkButton>
        </Card>
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Recent Rewards</h2>
          {recent.length ? <div className="mt-5 space-y-3">{recent.map((item: any) => <div key={item.id} className="rounded-[8px] bg-white/[0.04] p-4"><p className="font-black">{item.prizeName ?? "Reward"}</p><p className="mt-1 text-xs text-slate-400">{String(item.status ?? item.fulfillmentStatus ?? "recorded").replaceAll("_", " ")}</p></div>)}</div> : <EmptyState icon={<Gift />} title="No rewards yet" body="Buy DoroCoins to start earning Voter Points and unlock your first Basic Spin." action={<LinkButton href="/wallet">Buy DoroCoins</LinkButton>} />}
          <LinkButton href="/rewards/history" variant="secondary" className="mt-5 w-full">Reward History</LinkButton>
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-[var(--gold-2)]">{value}</p></Card>;
}
