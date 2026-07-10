"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Gift } from "lucide-react";

export default function RewardsHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    apiRequest<any>("/api/rewards").then((result) => result.ok && setHistory(result.data?.history ?? []));
  }, []);
  return <AppShell><PageTitle title="Reward History" subtitle="Spin results and manual fulfillment statuses." icon={<Gift />} />{history.length ? <div className="mt-8 grid gap-4">{history.map((item) => <Card key={item.id} className="p-5"><p className="font-black">{item.prizeName}</p><p className="mt-1 text-sm text-slate-400">{String(item.status).replaceAll("_", " ")}</p></Card>)}</div> : <Card className="mt-8"><EmptyState icon={<Gift />} title="No spins yet" body="Reward wheel spin history will appear here after you earn and use spin credits." /></Card>}</AppShell>;
}
