"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Building2, ClipboardCheck, ReceiptText, Search, ShieldCheck, Target, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, inputClass, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Kind = "challenges" | "assigned" | "submissions" | "reviews" | "analytics" | "finance" | "sponsorships" | "team" | "activity";
type Item = { id: string; title: string; category: string; displayStatus: string; assignment?: string | null; needsAttention?: boolean };
type Payload = { challenges: Item[]; access: { role: string; department: string; permissions: string[] }; metrics: Record<string, number>; pagination: { total: number } };
const settings: Record<Kind, { title: string; subtitle: string; icon: typeof Building2 }> = {
  challenges: { title: "Official Challenges", subtitle: "Challenge Suite organizational work visible within your access scope.", icon: Building2 },
  assigned: { title: "Assigned to Me", subtitle: "Challenges where you have an active staff responsibility.", icon: ClipboardCheck },
  submissions: { title: "Submission Operations", subtitle: "Open the relevant challenge to review real participant submissions.", icon: ShieldCheck },
  reviews: { title: "Review Queue", subtitle: "Official challenges requiring review work within your granted scope.", icon: ClipboardCheck },
  analytics: { title: "Enterprise Analytics", subtitle: "Recorded operational totals for official challenges visible to you.", icon: BarChart3 },
  finance: { title: "Enterprise Finance", subtitle: "Prepare challenge finance work without bypassing Admin payout finalization.", icon: ReceiptText },
  sponsorships: { title: "Enterprise Sponsorships", subtitle: "Manage designated sponsor work without mixing sponsor value into staff earnings.", icon: Target },
  team: { title: "Enterprise Team", subtitle: "Your staff department and permission-scoped operational access.", icon: UsersRound },
  activity: { title: "Enterprise Activity", subtitle: "Open challenge management to inspect immutable operational history.", icon: Activity },
};

export function EnterpriseSectionPage({ kind }: { kind: Kind }) {
  const [data, setData] = useState<Payload | null>(null); const [error, setError] = useState(""); const [search, setSearch] = useState("");
  useEffect(() => { apiRequest<Payload>("/api/enterprise/workspace").then((result) => result.ok && result.data ? setData(result.data) : setError(result.message)); }, []);
  const config = settings[kind]; const Icon = config.icon;
  const items = useMemo(() => (data?.challenges ?? []).filter((item) => kind !== "assigned" || item.assignment).filter((item) => kind !== "reviews" || item.needsAttention).filter((item) => `${item.title} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [data, kind, search]);
  return <AppShell><div className="mx-auto max-w-7xl"><PageTitle title={config.title} subtitle={config.subtitle} icon={<Icon className="text-[var(--gold)]" />} />{error ? <Card className="mt-7 p-6 text-red-700">{error}<div><LinkButton href="/contact" className="mt-5">Contact Support</LinkButton></div></Card> : !data ? <Card className="mt-7 h-72 animate-pulse" /> : <>
    {kind === "analytics" ? <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(data.metrics).map(([label, value]) => <Card key={label} className="p-5"><p className="text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-sm capitalize text-slate-600">{label.replace(/([A-Z])/g, " $1")}</p></Card>)}</div> : null}
    {kind === "team" ? <Card className="mt-7 p-6"><h2 className="text-xl font-black text-slate-950">{data.access.department}</h2><p className="mt-2 text-sm text-slate-600">Role: {data.access.role.replaceAll("_", " ")}</p><p className="mt-4 text-sm text-slate-600">{data.access.permissions.length} granted permissions. Permission changes remain Admin-authorized.</p></Card> : null}
    {!(["analytics", "team"] as Kind[]).includes(kind) ? <><div className="mt-7 max-w-md"><label className="relative block"><Search className="absolute left-3 top-3.5 text-slate-400" size={18} /><span className="sr-only">Search official challenges</span><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search official challenges" /></label></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} className="p-5"><p className="text-xs font-black uppercase text-amber-700">{item.displayStatus}</p><h2 className="mt-2 text-lg font-black text-slate-950">{item.title}</h2><p className="mt-1 text-sm text-slate-600">{item.assignment ?? item.category}</p><LinkButton href={`/challenges/${item.id}/manage`} className="mt-5">Open Operations</LinkButton></Card>)}{!items.length ? <Card className="p-6 text-sm text-slate-600">No records in this Enterprise scope.</Card> : null}</div></> : null}
  </>}</div></AppShell>;
}
