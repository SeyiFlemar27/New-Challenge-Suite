"use client";

import { useEffect, useState } from "react";
import { Coins, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button, Card, Field, PageTitle, inputClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

export default function EconomyRulesPage() {
  const [data, setData] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  async function load() { const result = await apiRequest<any>("/api/admin/economy-rules"); if (result.data) setData(result.data); else setNotice(result.message); }
  useEffect(() => { void load(); }, []);
  async function action(actionName: string, versionId?: string) { const result = await apiRequest("/api/admin/economy-rules", { method: "POST", body: JSON.stringify({ action: actionName, versionId, reason }) }); setNotice(result.message); if (result.ok) await load(); }
  async function runExpiry() { const result = await apiRequest("/api/admin/economy/growth-wallet-expiry", { method: "POST", body: JSON.stringify({ reason }) }); setNotice(result.message); if (result.ok) await load(); }
  const rules = data?.activeRules;
  const monitoring = data?.monitoring ?? {};
  return <AdminShell>
    <PageTitle title="Economy Rules" subtitle="Developer Tools - versioned future-transaction economy controls" icon={<Coins />} />
    <Card className="mt-7 p-6"><div className="flex items-center gap-3"><ShieldCheck className="text-[var(--gold)]" /><div><h2 className="text-xl font-black">Active version: {rules?.version ?? "Loading"}</h2><p className="text-sm text-slate-600">Changes require a reason, recent admin authentication, and Super Admin or Platform Owner approval.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Paid vote" value={`${rules?.voting?.paidVoteCostCredits ?? 10} Credits`} /><Metric label="Paid vote daily cap" value={rules?.voting?.paidVoteDailyLimit ?? 10} /><Metric label="Growth allocation default" value={`${rules?.growthWallet?.defaultAllocationPercent ?? 10}%`} /><Metric label="Rule effect" value="Future transactions" /></div></Card>
    <Card className="mt-6 p-6"><h2 className="text-xl font-black">Economy monitoring</h2><p className="mt-2 text-sm text-slate-600">Counts and volumes come from stored ledger and Action Centre records. No synthetic metrics are shown.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="DoroCoin ledger entries" value={monitoring.doroCoinTransactionCount ?? 0} /><Metric label="DoroCoin reversals" value={monitoring.doroCoinReversalCount ?? 0} /><Metric label="Reward cap hits" value={monitoring.doroCoinCapHitCount ?? 0} /><Metric label="Suspicious reward tasks" value={monitoring.suspiciousDoroCoinTaskCount ?? 0} /><Metric label="Challenge Credit entries" value={monitoring.challengeCreditTransactionCount ?? 0} /><Metric label="Paid vote holds" value={monitoring.paidVoteHoldCount ?? 0} /><Metric label="Growth Wallet entries" value={monitoring.growthWalletTransactionCount ?? 0} /><Metric label="Upcoming Growth expiries" value={monitoring.growthWalletUpcomingExpiryCount ?? 0} /><Metric label="Expired allocations" value={monitoring.growthWalletExpiredAllocationCount ?? 0} /><Metric label="Failed expiry runs" value={monitoring.failedGrowthWalletExpiryRunCount ?? 0} /><Metric label="Open economy tasks" value={monitoring.openEconomyActionTaskCount ?? 0} /></div><div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled={reason.length < 8} onClick={() => void runExpiry()}>Run Growth Wallet Expiry</Button><p className="text-sm text-slate-600">Last run: {monitoring.lastGrowthWalletExpiryRun?.updatedAt ? new Date(monitoring.lastGrowthWalletExpiryRun.updatedAt).toLocaleString() : "No run recorded"}</p></div></Card>
    <Card className="mt-6 p-6"><Field label="Required change reason"><input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the economy change" /></Field><Button className="mt-4" disabled={reason.length < 8} onClick={() => void action("create_draft")}>Create Draft Version</Button></Card>
    <div className="mt-6 grid gap-4">{(data?.versions ?? []).map((item: any) => <Card key={item.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-[var(--gold)]">{String(item.status).replaceAll("_", " ")}</p><h2 className="mt-1 font-black">{item.version}</h2><p className="mt-2 text-sm text-slate-600">{item.reason}</p></div><div className="flex gap-2">{item.status === "draft" ? <Button disabled={reason.length < 8} onClick={() => void action("submit", item.id)}>Submit</Button> : null}{item.status === "pending_super_admin_approval" ? <Button disabled={reason.length < 8} onClick={() => void action("approve", item.id)}>Approve</Button> : null}</div></div></Card>)}</div>
    {notice ? <p className="mt-5 rounded-[8px] bg-amber-50 p-4 text-sm text-amber-950">{notice}</p> : null}
  </AdminShell>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-[8px] border border-black/10 bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div>; }
