"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Gift } from "lucide-react";

export default function RewardsHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest<any>("/api/rewards").then((result) => result.ok ? setHistory(result.data?.history ?? []) : setMessage(result.message));
  }, []);
  return (
    <AppShell>
      <PageTitle title="Reward History" subtitle="Spin results, prize status, and manual fulfillment updates." icon={<Gift />} />
      {message ? <Card className="mt-6 border-yellow-500/20 p-4 text-yellow-100">{message}</Card> : null}
      {history.length ? <div className="mt-8 grid gap-4">{history.map((item) => <Card key={item.id} className="p-5"><div className="grid gap-4 md:grid-cols-[1fr_180px_180px]"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{String(item.wheelTier ?? "wheel")} wheel</p><h2 className="mt-2 text-xl font-black">{item.prizeName ?? "Reward"}</h2><p className="mt-2 text-sm text-slate-400">{item.prizeDescription ?? item.fulfillmentInstructions ?? "Reward details will appear as fulfillment progresses."}</p></div><Status label="Fulfillment" value={item.fulfillmentStatus ?? item.status ?? "recorded"} /><Status label="Manual" value={item.manualFulfillmentRequired ? "Pending team" : "Server controlled"} /></div></Card>)}</div> : <Card className="mt-8"><EmptyState icon={<Gift />} title="No spins yet" body="Reward wheel spin history will appear here after you earn and use spin credits." action={<LinkButton href="/rewards/wheel">Open Spin Wheel</LinkButton>} /></Card>}
    </AppShell>
  );
}

function Status({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-[8px] bg-white/[0.04] p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 font-black capitalize">{String(value).replaceAll("_", " ")}</p></div>;
}
