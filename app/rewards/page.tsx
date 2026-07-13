"use client";

import { useEffect, useState } from "react";
import { Gift, History, ShoppingCart, Sparkles, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
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
  const tiers = data?.tiers ?? [];
  const next = data?.progress?.nextTier ?? tiers.find((tier: any) => points < Number(tier.pointsRequired));
  const needed = next ? Math.max(0, Number(next.pointsRequired) - points) : 0;
  const recent = data?.recentRewards ?? data?.history?.slice?.(0, 5) ?? [];
  const noCredits = !Number(credits.basic ?? 0) && !Number(credits.standard ?? 0) && !Number(credits.premium ?? 0);
  const setupRequired = Boolean(data?.prizeSetupRequired);

  return (
    <AppShell>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <PageTitle title="Voter Rewards" subtitle="Earn points from eligible DoroCoin purchases and use them to unlock reward spins." icon={<Gift className="text-[var(--gold)]" />} />
        <div className="flex flex-col gap-3 sm:flex-row xl:pt-2">
          <LinkButton href="/rewards/history" variant="secondary" className="justify-center"><History size={17} /> Reward History</LinkButton>
          <LinkButton href="/rewards/wheel" className="justify-center"><Trophy size={17} /> Open Spin Wheel</LinkButton>
        </div>
      </div>

      {message ? <Card className="mt-6 border-yellow-500/20 p-4 text-yellow-100">{message}</Card> : null}
      {!data && !message ? <div className="mt-8 grid gap-5 md:grid-cols-4">{[0, 1, 2, 3].map((item) => <Card key={item} className="h-32 animate-pulse" />)}</div> : null}

      {data ? <>
        <div className="mt-8 grid gap-5 md:grid-cols-4">
          <Metric label="Available Points" value={points.toLocaleString()} />
          <Metric label="Lifetime Points" value={lifetime.toLocaleString()} />
          <Metric label="Basic Spins" value={String(credits.basic ?? 0)} />
          <Metric label="Standard / Premium" value={`${credits.standard ?? 0} / ${credits.premium ?? 0}`} />
        </div>

        {points <= 0 && noCredits ? <Card className="mt-8 border-[var(--gold)]/25 bg-[var(--gold)]/5 p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-2xl font-black"><Gift className="text-[var(--gold)]" /> No rewards yet</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Eligible reward activity will appear here once you begin earning points.</p>
          <div className="mt-5 flex flex-wrap gap-3"><LinkButton href="/wallet"><ShoppingCart size={17} /> Buy DoroCoins</LinkButton></div>
        </Card> : null}

        {setupRequired ? <Card className="mt-8 border-yellow-500/20 bg-yellow-500/5 p-6">
          <h2 className="text-xl font-black text-yellow-100">Reward prize setup required</h2>
          <p className="mt-2 text-sm leading-6 text-yellow-50/80">Reward points and credits can still be tracked. Prize records need administrator configuration before spins can award prizes.</p>
          <LinkButton href="/rewards/wheel" variant="secondary" className="mt-4">Open Spin Wheel</LinkButton>
        </Card> : null}

        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_380px]">
          <Card className="p-6 sm:p-8">
            <h2 className="flex items-center gap-2 text-2xl font-black"><Sparkles className="text-[var(--gold)]" /> Tier progress</h2>
            {next ? <div className="mt-6"><div className="flex flex-col gap-2 text-sm font-bold sm:flex-row sm:justify-between"><span>{points.toLocaleString()} points</span><span>{needed.toLocaleString()} more for {next.label}</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(100, Math.round(points / Number(next.pointsRequired) * 100))}%` }} /></div><p className="mt-4 rounded-[8px] bg-[var(--gold)]/10 p-4 text-sm font-bold text-[var(--gold)]">{needed.toLocaleString()} more points to unlock your next {next.label} spin.</p></div> : <p className="mt-5 rounded-[8px] bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">All current reward tiers reached. Future DoroCoin purchases continue adding lifetime points and configured spin credits.</p>}
            <div className="mt-7 grid gap-4 md:grid-cols-3">{tiers.map((tier: any) => <Card key={tier.id} className="bg-black/30 p-4"><p className="font-black">{tier.label}</p><p className="mt-2 text-sm text-slate-400">{Number(tier.pointsRequired).toLocaleString()} points unlock 1 {tier.id} spin.</p><p className="mt-3 text-xs font-bold text-[var(--gold)]">{tier.enabled ? "Enabled" : "Disabled by admin"}</p></Card>)}</div>
            <div className="mt-7 flex flex-wrap gap-3"><LinkButton href="/wallet" variant="secondary"><ShoppingCart size={17} /> Buy DoroCoins</LinkButton></div>
            {data.settings?.publicWheelRules ? <p className="mt-5 text-sm text-slate-400">{data.settings.publicWheelRules}</p> : null}
          </Card>
          <Card className="p-6 sm:p-8">
            <h2 className="flex items-center gap-2 text-2xl font-black"><History className="text-[var(--gold)]" /> Recent reward activity</h2>
            {recent.length ? <div className="mt-5 space-y-3">{recent.map((item: any) => <div key={item.id} className="rounded-[8px] bg-white/[0.04] p-4"><p className="font-black">{item.prizeName ?? "Reward"}</p><p className="mt-1 text-xs capitalize text-slate-400">{String(item.fulfillmentStatus ?? item.status ?? "recorded").replaceAll("_", " ")}</p></div>)}</div> : <EmptyState icon={<Gift />} title="No rewards yet" body="Eligible reward activity will appear here once you begin earning points." action={<LinkButton href="/wallet">Buy DoroCoins</LinkButton>} />}
          </Card>
        </div>
      </> : null}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-black text-[var(--gold-2)]">{value}</p></Card>;
}