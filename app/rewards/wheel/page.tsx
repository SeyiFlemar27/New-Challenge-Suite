"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Gift } from "lucide-react";

export default function RewardsWheelPage() {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest("/api/rewards").then((result) => result.ok && setData(result.data));
  }, []);
  async function spin() {
    const result = await apiRequest("/api/rewards", { method: "POST", body: JSON.stringify({ action: "spin" }) });
    setMessage(result.message);
  }
  return (
    <AppShell>
      <PageTitle title="Doro Rewards Wheel" subtitle="Earn voter points from vote purchases, unlock spin credits by tier, and record prizes for admin fulfillment." icon={<Gift />} />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-black">Voter Points</h2>
          <p className="mt-3 text-slate-300">{Number(data?.points ?? 0).toLocaleString()} points · {Number(data?.spinCredits ?? 0).toLocaleString()} spin credits</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">{(data?.tiers ?? []).map((tier: any) => <Card key={tier.id} className="p-4"><p className="font-black">{tier.label}</p><p className="mt-1 text-sm text-slate-400">{tier.pointsRequired} points · {tier.spinCredits} {tier.spinTier} spin{tier.spinCredits === 1 ? "" : "s"}</p></Card>)}</div>
          <Button className="mt-7" onClick={spin}>Spin Reward Wheel</Button>
          {message ? <p className="mt-4 rounded-[8px] bg-yellow-500/10 p-4 text-sm text-yellow-100">{message}</p> : null}
        </Card>
        <Card className="p-6"><h2 className="text-xl font-black">Safety rules</h2><p className="mt-3 text-sm leading-6 text-slate-300">This is not a cash lottery. Default prizes include DoroCoin bonuses, free votes, badges, profile highlights, sponsor coupons, merch, gift cards, and event tickets. High-value/manual prizes require admin fulfillment.</p><LinkButton href="/rewards/history" className="mt-5" variant="secondary">View History</LinkButton></Card>
      </div>
    </AppShell>
  );
}
