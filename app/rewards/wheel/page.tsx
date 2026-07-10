"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Gift } from "lucide-react";

const wheelCopy: Record<string, string[]> = {
  basic: ["Small DoroCoin bonus", "Free vote", "Basic badge", "Small discount", "Try again"],
  standard: ["Larger DoroCoin bonus", "Multiple free votes", "Standard badge", "Profile highlight", "Sponsor coupon"],
  premium: ["Bigger DoroCoin bonus", "Premium badge", "Event ticket/manual prize", "Merch/product prize", "Gift card/manual prize"]
};

export default function RewardsWheelPage() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [selectedTier, setSelectedTier] = useState("basic");
  useEffect(() => {
    apiRequest("/api/rewards").then((result) => result.ok && setData(result.data));
  }, []);
  const credits = data?.spinCreditsByTier ?? { basic: 0, standard: 0, premium: 0 };
  const tiers = data?.tiers ?? [];
  const nextTier = useMemo(() => tiers.find((tier: any) => Number(data?.points ?? 0) < Number(tier.pointsRequired)), [tiers, data?.points]);
  async function spin() {
    const result = await apiRequest("/api/rewards", { method: "POST", body: JSON.stringify({ action: "spin", tier: selectedTier }) });
    setMessage(result.message);
    if (result.ok) apiRequest("/api/rewards").then((next) => next.ok && setData(next.data));
  }
  return (
    <AppShell>
      <PageTitle title="Doro Rewards Wheel" subtitle="Earn points from server-confirmed DoroCoin purchases, unlock tiered spin credits, and record prizes for admin fulfillment." icon={<Gift />} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">DoroCoin Purchase Points</h2>
          <p className="mt-3 text-slate-300">{Number(data?.points ?? 0).toLocaleString()} points · Basic {Number(credits.basic ?? 0)} · Standard {Number(credits.standard ?? 0)} · Premium {Number(credits.premium ?? 0)} spin credits</p>
          {nextTier ? <p className="mt-3 rounded-[8px] bg-[var(--gold)]/10 p-3 text-sm font-bold text-[var(--gold)]">{Math.max(0, Number(nextTier.pointsRequired) - Number(data?.points ?? 0)).toLocaleString()} points until your next {nextTier.label} spin credit.</p> : <p className="mt-3 rounded-[8px] bg-emerald-500/10 p-3 text-sm font-bold text-emerald-200">All current reward tiers reached. Future purchases continue adding lifetime points.</p>}
          <div className="mt-6 grid gap-4 md:grid-cols-3">{tiers.map((tier: any) => <button key={tier.id} onClick={() => setSelectedTier(tier.spinTier)} className={`rounded-[8px] border p-4 text-left ${selectedTier === tier.spinTier ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-white/10 bg-[#151515]"}`}><p className="font-black">{tier.label} Wheel</p><p className="mt-1 text-sm text-slate-400">{tier.pointsRequired} points · {tier.spinCredits} {tier.spinTier} spin</p><p className="mt-2 text-xs font-bold text-[var(--gold)]">Credits: {Number(credits[tier.spinTier] ?? 0)}</p></button>)}</div>
          <Card className="mt-6 bg-black/30 p-4"><p className="text-sm font-bold uppercase text-slate-400">Selected wheel</p><h3 className="mt-1 text-xl font-black capitalize">{selectedTier} Wheel</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{(wheelCopy[selectedTier] ?? []).map((item) => <div key={item} className="rounded-[8px] bg-[#181818] p-3 text-sm font-bold text-slate-300">{item}</div>)}</div></Card>
          <Button className="mt-7" onClick={spin} disabled={Number(credits[selectedTier] ?? 0) <= 0}>Spin {selectedTier[0].toUpperCase()}{selectedTier.slice(1)} Wheel</Button>
          {message ? <p className="mt-4 rounded-[8px] bg-yellow-500/10 p-4 text-sm text-yellow-100">{message}</p> : null}
        </Card>
        <Card className="p-6"><h2 className="text-xl font-black">Safety rules</h2><p className="mt-3 text-sm leading-6 text-slate-300">This is not a cash lottery. Spin credits are granted only after server-confirmed DoroCoin purchases. Users cannot self-grant points or credits. High-value/manual prizes require admin fulfillment and no cash-out prize is enabled by default.</p><LinkButton href="/rewards/history" className="mt-5" variant="secondary">View History</LinkButton></Card>
      </div>
    </AppShell>
  );
}

