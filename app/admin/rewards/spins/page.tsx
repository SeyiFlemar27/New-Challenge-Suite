"use client";
import { useEffect, useState } from "react";
import { Card, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { RotateCw } from "lucide-react";
export default function RewardSpinsPage(){const [spins,setSpins]=useState<any[]>([]); useEffect(()=>{apiRequest<any>("/api/admin/rewards/spins").then(r=>r.ok&&setSpins(r.data?.spins??[]));},[]); return <><PageTitle title="Reward Spin History" subtitle="Audit confirmed server-selected spins, campaign, tier, prize, and fulfilment status." icon={<RotateCw/>}/><Card className="mt-8 overflow-x-auto p-5"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">User</th><th>Tier</th><th>Prize</th><th>Status</th><th>Fulfilment</th><th>Reference</th><th>Date</th></tr></thead><tbody>{spins.map(s=><tr key={s.id} className="border-t border-white/10"><td className="p-3">{s.userId}</td><td className="capitalize">{s.wheelTier}</td><td>{s.prizeName}</td><td>{s.status}</td><td>{s.fulfillmentStatus}</td><td>{s.id}</td><td>{s.createdAt}</td></tr>)}</tbody></table></Card></>}
