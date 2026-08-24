"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Award, CalendarCheck, Gift, History, Sparkles, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Summary = {
  availableRewardPoints?: number;
  lifetimeRewardPoints?: number;
  streak?: { current?: number; eligibleToday?: boolean; checkedInToday?: boolean };
  achievements?: Array<{ id: string }>;
  entitlements?: Array<{ id: string; type?: string }>;
};

const tiers = [
  { id: "basic", label: "Basic Spin", cost: 100 },
  { id: "standard", label: "Standard Spin", cost: 250 },
  { id: "premium", label: "Premium Spin", cost: 500 }
];

export default function RewardsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [message, setMessage] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);

  function load() {
    apiRequest<Summary>("/api/rewards/summary").then((result) => result.ok ? setData(result.data ?? null) : setMessage(result.message));
  }

  useEffect(load, []);

  async function checkIn() {
    setCheckingIn(true);
    const result = await apiRequest("/api/rewards/check-in", { method: "POST" });
    setMessage(result.message || (result.ok ? "Check-in recorded." : "Check-in could not be completed."));
    setCheckingIn(false);
    if (result.ok) load();
  }

  const points = Number(data?.availableRewardPoints ?? 0);
  const lifetime = Number(data?.lifetimeRewardPoints ?? points);
  const streak = Number(data?.streak?.current ?? 0);

  return <AppShell>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <PageTitle title="Rewards" subtitle="Earn Reward Points through eligible activity and use them for spins. Reward Points have no cash value and are separate from DoroCoins." icon={<Gift className="text-[var(--gold)]" />} />
      <div className="flex flex-col gap-3 sm:flex-row xl:pt-2">
        <LinkButton href="/rewards/history" variant="secondary" className="justify-center"><History size={17} /> History</LinkButton>
        <LinkButton href="/rewards/wheel" className="justify-center"><Trophy size={17} /> Spin Wheel</LinkButton>
      </div>
    </div>

    {message ? <Card className="mt-6 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    {!data && !message ? <div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-32 animate-pulse" />)}</div> : null}

    {data ? <>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Metric label="Available Points" value={points.toLocaleString()} icon={<Sparkles size={18} />} />
        <Metric label="Lifetime Earned" value={lifetime.toLocaleString()} icon={<Award size={18} />} />
        <Metric label="Current Streak" value={streak + " day" + (streak === 1 ? "" : "s")} icon={<CalendarCheck size={18} />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Choose a spin</h2>
          <p className="mt-2 text-sm text-slate-400">Each spin directly deducts its point cost. You can spin again whenever your balance is sufficient.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">{tiers.map((tier) => <div key={tier.id} className="rounded-[8px] border border-white/10 p-4"><p className="font-black">{tier.label}</p><p className="mt-3 text-2xl font-black text-[var(--gold)]">{tier.cost}</p><p className="text-xs text-slate-400">Reward Points</p></div>)}</div>
          <LinkButton href="/rewards/wheel" className="mt-6"><Trophy size={17} /> Open Spin Wheel</LinkButton>
        </Card>

        <Card className="p-6 sm:p-8">
          <h2 className="text-xl font-black">Daily streak</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Eligible activity unlocks today&apos;s check-in. Checking in does not award points by itself; milestone rewards are awarded once.</p>
          <button type="button" onClick={checkIn} disabled={checkingIn || !data.streak?.eligibleToday || data.streak?.checkedInToday} className="mt-5 min-h-11 rounded-[8px] bg-[var(--gold)] px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50">{data.streak?.checkedInToday ? "Checked in today" : checkingIn ? "Checking in..." : "Check in"}</button>
          <p className="mt-4 text-xs text-slate-500">Milestones: 3, 7, 14, and 30 days.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card className="p-6"><h2 className="text-xl font-black">Achievements</h2><p className="mt-2 text-sm text-slate-400">{data.achievements?.length ? data.achievements.length + " earned." : "Your verified achievements will appear here."}</p></Card>
        <Card className="p-6"><h2 className="text-xl font-black">Available rewards</h2><p className="mt-2 text-sm text-slate-400">{data.entitlements?.length ? data.entitlements.length + " available." : "Spin rewards such as entry discounts and boosts will appear here."}</p></Card>
      </div>
    </> : null}
  </AppShell>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <Card className="p-5"><div className="flex items-center gap-2 text-[var(--gold)]">{icon}<p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p></div><p className="mt-3 text-3xl font-black text-[var(--gold-2)]">{value}</p></Card>;
}
