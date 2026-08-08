"use client";

import { useEffect, useState } from "react";
import { Sprout, History } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, EmptyState, Field, PageTitle, inputClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

export default function CreatorGrowthWalletPage() {
  const [data, setData] = useState<any>(null); const [allocation, setAllocation] = useState("0"); const [notice, setNotice] = useState("");
  async function load() { const result = await apiRequest<any>("/api/economy/summary"); if (result.data) { setData(result.data); setAllocation(String(result.data.balances.creatorGrowthWallet.allocationPercent ?? 0)); } else setNotice(result.message); }
  useEffect(() => { void load(); }, []);
  async function save() { const result = await apiRequest("/api/creator/growth-wallet", { method: "PATCH", body: JSON.stringify({ allocationPercent: Number(allocation) }) }); setNotice(result.message); if (result.ok) await load(); }
  const wallet = data?.balances?.creatorGrowthWallet; const history = data?.histories?.creatorGrowthWallet ?? [];
  return <AppShell><PageTitle title="Creator Growth Wallet" subtitle="Restricted reinvestment funds for approved creator growth tools." icon={<Sprout/>}/><div className="mt-7 grid gap-5 lg:grid-cols-2"><Card className="p-6"><p className="text-sm font-bold text-slate-500">Restricted balance</p><p className="mt-2 text-4xl font-black">${(Number(wallet?.balanceCents ?? 0)/100).toFixed(2)}</p><p className="mt-4 text-sm leading-6 text-slate-600">Creator Growth Wallet funds are restricted for approved growth tools and cannot be withdrawn as cash.</p></Card><Card className="p-6"><h2 className="text-xl font-black">Future earning allocation</h2><p className="mt-2 text-sm text-slate-600">Optionally direct 0% to 30% of future creator earnings to growth tools.</p><Field label="Allocation percentage"><input className={inputClass} type="number" min="0" max="30" value={allocation} onChange={(e)=>setAllocation(e.target.value)}/></Field><Button className="mt-4" onClick={() => void save()}>Save Allocation</Button></Card></div><Card className="mt-7 p-6"><h2 className="flex items-center gap-2 text-xl font-black"><History/> Growth Wallet History</h2><div className="mt-4">{history.length ? history.map((item:any)=><div key={item.id} className="flex justify-between border-b border-black/10 py-3 text-sm"><span>{String(item.reason ?? item.sourceType)}</span><strong>${(Number(item.signedAmountCents ?? 0)/100).toFixed(2)}</strong></div>) : <EmptyState icon={<History/>} title="No Growth Wallet activity" body="Future allocations, approved spends, expiries, and admin adjustments will appear here."/>}</div></Card>{notice?<p className="mt-5 rounded-[8px] bg-amber-50 p-4 text-sm text-amber-950">{notice}</p>:null}</AppShell>;
}
