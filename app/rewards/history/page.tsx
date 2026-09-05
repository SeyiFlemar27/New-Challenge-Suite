"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift, History } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type ActivityRecord = { id: string; createdAt?: string; updatedAt?: string; direction?: string; amount?: number; description?: string; prizeName?: string; rewardName?: string; wheelTier?: string; fulfillmentStatus?: string; status?: string; type?: string; sourceType?: string };
type HistoryData = { history: ActivityRecord[]; ledger: ActivityRecord[]; grants: ActivityRecord[]; entitlements: ActivityRecord[]; fulfillments: ActivityRecord[] };

function when(item: ActivityRecord) { return item.createdAt ?? item.updatedAt ?? ""; }
function formattedTime(value?: string) { if (!value) return "Recorded"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Recorded" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }

export default function RewardsHistoryPage() {
  const [data, setData] = useState<HistoryData>({ history: [], ledger: [], grants: [], entitlements: [], fulfillments: [] });
  const [message, setMessage] = useState("");
  useEffect(() => { void apiRequest<HistoryData>("/api/rewards/history").then((result) => result.ok ? setData(result.data ?? { history: [], ledger: [], grants: [], entitlements: [], fulfillments: [] }) : setMessage(result.message)); }, []);
  const activity = useMemo(() => [
    ...data.ledger.map((item) => ({ ...item, activityKind: "Reward Points" })),
    ...data.history.map((item) => ({ ...item, activityKind: `${item.wheelTier ?? "Reward"} Spin` })),
    ...data.grants.map((item) => ({ ...item, activityKind: "Reward Grant" })),
    ...data.entitlements.map((item) => ({ ...item, activityKind: "Entitlement" })),
    ...data.fulfillments.map((item) => ({ ...item, activityKind: "Fulfillment" })),
  ].sort((left, right) => when(right).localeCompare(when(left))), [data]);

  return <AppShell>
    <PageTitle title="Reward Activity" subtitle="Track Reward Point credits and debits, Spins, grants, entitlements, and fulfillment changes recorded by Challenge Suite." icon={<History />} />
    {message ? <Card className="mt-6 p-4 text-sm font-bold" role="status">{message}</Card> : null}
    <div className="mt-8 space-y-3">
      {activity.length ? activity.map((item) => <Card key={`${item.activityKind}-${item.id}`} className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-xs font-black uppercase text-[var(--gold)]">{item.activityKind}</p><h2 className="mt-1 truncate font-black">{item.prizeName ?? item.rewardName ?? item.description ?? String(item.type ?? item.sourceType ?? "Reward activity").replaceAll("_", " ")}</h2><p className="mt-1 text-sm capitalize text-[var(--muted)]">{String(item.fulfillmentStatus ?? item.status ?? item.direction ?? "recorded").replaceAll("_", " ")}</p></div>
          <div className="shrink-0 text-left sm:text-right">{item.amount ? <p className={`font-black ${item.direction === "debit" ? "text-red-600" : "text-emerald-700"}`}>{item.direction === "debit" ? "-" : "+"}{Number(item.amount).toLocaleString()} points</p> : null}<p className="mt-1 text-xs text-[var(--muted)]">{formattedTime(when(item))}</p></div>
        </div>
      </Card>) : <Card className="p-8 text-center"><Gift className="mx-auto text-[var(--gold)]" size={42} /><h2 className="mt-4 text-2xl font-black">No reward activity yet</h2><p className="mt-2 text-[var(--muted)]">Confirmed Reward activity will appear here.</p></Card>}
    </div>
  </AppShell>;
}
