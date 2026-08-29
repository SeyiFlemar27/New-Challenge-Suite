"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Award, CalendarCheck, Gift, History, Sparkles, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Summary = {
  availableRewardPoints?: number;
  streak?: { current?: number; eligibleToday?: boolean; checkedInToday?: boolean; nextMilestone?: { days: number; points: number } | null };
  achievements?: Array<{ id: string; current: number; target: number; points: number; earned: boolean }>;
  entitlements?: Array<{ id: string; type?: string; value?: number; status?: string }>;
  recentRewards?: Array<{ id: string; prizeName?: string; prizeType?: string; createdAt?: string }>;
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
  const streak = Number(data?.streak?.current ?? 0);

  return <AppShell>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <PageTitle title="Rewards" subtitle="Earn Reward Points from verified Challenge Suite activity, build streaks, unlock achievements, and use points for Spins." icon={<Gift className="text-[var(--gold)]" />} />
      <div className="flex flex-col gap-3 sm:flex-row xl:pt-2">
        <LinkButton href="/rewards/history" variant="secondary" className="justify-center"><History size={17} /> History</LinkButton>
        <LinkButton href="/rewards/wheel" className="justify-center"><Trophy size={17} /> Spin Wheel</LinkButton>
      </div>
    </div>

    {message ? <Card className="mt-6 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    {!data && !message ? <div className="mt-8 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Card key={item} className="h-32 animate-pulse" />)}</div> : null}

    {data ? <>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Metric label="Reward Points" value={points.toLocaleString()} icon={<Sparkles size={18} />} />
        <Metric label="Current Streak" value={streak + " day" + (streak === 1 ? "" : "s")} icon={<CalendarCheck size={18} />} />
        <Metric label="Your Rewards" value={String(data.entitlements?.length ?? 0)} icon={<Award size={18} />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Spin & Win</h2>
          <p className="mt-2 text-sm text-slate-400">Review the published odds and confirm the point cost before each Spin. A Bonus Spin is used first when one is available.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">{tiers.map((tier) => <div key={tier.id} className="rounded-[8px] border border-white/10 p-4"><p className="font-black">{tier.label}</p><p className="mt-3 text-2xl font-black text-[var(--gold)]">{tier.cost}</p><p className="text-xs text-slate-400">Reward Points</p></div>)}</div>
          <LinkButton href="/rewards/wheel" className="mt-6"><Trophy size={17} /> Open Spin Wheel</LinkButton>
        </Card>

        <Card className="p-6 sm:p-8">
          <h2 className="text-xl font-black">Daily streak</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Eligible activity unlocks today&apos;s check-in. Checking in does not award points by itself; milestone rewards are awarded once.</p>
          <button type="button" onClick={checkIn} disabled={checkingIn || !data.streak?.eligibleToday || data.streak?.checkedInToday} className="mt-5 min-h-11 rounded-[8px] bg-[var(--gold)] px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50">{data.streak?.checkedInToday ? "Checked in today" : checkingIn ? "Checking in..." : "Check in"}</button>
          <p className="mt-4 text-xs text-slate-500">{data.streak?.nextMilestone ? `Next milestone: ${data.streak.nextMilestone.days} days · ${data.streak.nextMilestone.points} Reward Points.` : "All current streak milestones completed."}</p>
        </Card>
      </div>

      <Card className="mt-6 p-6"><h2 className="text-xl font-black">Earn Points</h2><p className="mt-2 text-sm text-slate-400">Points are recorded only after the qualifying activity is confirmed by Challenge Suite.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{["Complete your profile", "Verify your account", "Submit an approved entry", "Complete a challenge", "Cast a valid free vote", "Earn an official placement"].map((method) => <div key={method} className="rounded-[8px] border border-white/10 p-4 text-sm font-bold">{method}</div>)}</div></Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-6"><h2 className="text-xl font-black">Achievements</h2><div className="mt-5 space-y-4">{data.achievements?.map((achievement) => <div key={achievement.id}><div className="flex items-center justify-between gap-4 text-sm"><span className="font-bold capitalize">{achievement.id.replaceAll("-", " ")}</span><span className="text-slate-400">{achievement.earned ? "Earned" : `${achievement.current}/${achievement.target}`}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--gold)]" style={{ width: `${Math.min(100, achievement.target ? achievement.current / achievement.target * 100 : 0)}%` }} /></div></div>)}</div></Card>
        <Card className="p-6"><h2 className="text-xl font-black">Your Rewards</h2>{data.entitlements?.length ? <div className="mt-5 space-y-3">{data.entitlements.map((item) => <div key={item.id} className="rounded-[8px] border border-white/10 p-4"><p className="font-bold capitalize">{String(item.type ?? "reward").replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-400">Available to use through the applicable Challenge Suite flow.</p></div>)}</div> : <p className="mt-2 text-sm text-slate-400">Entry discounts, boosts, Bonus Spins, and badges you win will appear here.</p>}</Card>
      </div>
      <Card className="mt-6 p-6"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black">Recent Rewards</h2><LinkButton href="/rewards/history" variant="secondary">View History</LinkButton></div>{data.recentRewards?.length ? <div className="mt-5 divide-y divide-white/10">{data.recentRewards.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-4"><span className="font-bold">{item.prizeName}</span><span className="text-sm text-slate-400">{item.createdAt ?? "Recorded"}</span></div>)}</div> : <p className="mt-4 text-sm text-slate-400">Your confirmed Spin results will appear here.</p>}</Card>
    </> : null}
  </AppShell>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <Card className="p-5"><div className="flex items-center gap-2 text-[var(--gold)]">{icon}<p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p></div><p className="mt-3 text-3xl font-black text-[var(--gold-2)]">{value}</p></Card>;
}
