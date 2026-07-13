"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Search } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, EmptyState, Field, inputClass, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { deliverableStatuses, label } from "@/lib/sponsor-collaboration";

export default function SponsorDeliverablesPage() {
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  async function load() { const [profileResult, result] = await Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<{ deliverables: any[] }>("/api/sponsor/deliverables")]); if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile); if (result.ok && result.data) setItems(result.data.deliverables); else setNotice(result.message || "Deliverables could not be loaded."); setLoading(false); }
  useEffect(() => { void load(); }, []);
  async function create() { const result = await apiRequest("/api/sponsor/deliverables", { method: "POST", body: JSON.stringify({ title, campaignId, dueDate, description }) }); setNotice(result.message); if (result.ok) { setTitle(""); setCampaignId(""); setDueDate(""); setDescription(""); void load(); } }
  const filtered = useMemo(() => items.filter((item) => (status === "all" || item.status === status) && (!query || [item.title, item.relatedCampaignId, item.ownerCreatorFoundation].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))), [items, query, status]);
  return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Deliverables</p><h1 className="mt-3 text-4xl font-black">Campaign deliverables</h1><p className="mt-3 max-w-3xl leading-7 text-slate-300">Track submissions, feedback, approvals, and revision history. Approving deliverables does not release sponsor money.</p></div><LinkButton href="/sponsor/approvals" variant="secondary">Approval Center</LinkButton></div><div className="mt-8 grid gap-8 xl:grid-cols-[.85fr_1.15fr]"><Card className="p-6"><h2 className="text-2xl font-black">Create deliverable</h2><div className="mt-5 grid gap-4"><Field label="Deliverable title"><input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="Campaign ID"><input className={inputClass} value={campaignId} onChange={(event) => setCampaignId(event.target.value)} /></Field><Field label="Due date"><input className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field><Field label="Description"><textarea className={textareaClass} value={description} onChange={(event) => setDescription(event.target.value)} /></Field><Button disabled={title.length < 3} onClick={() => void create()}>Create Deliverable</Button>{notice ? <p className="text-sm text-slate-300">{notice}</p> : null}</div></Card><div><Card className="p-4"><div className="grid gap-3 lg:grid-cols-[1fr_240px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deliverables" /></div><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{deliverableStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div></Card>{loading ? <Card className="mt-5 h-72 animate-pulse bg-[#171717]" /> : filtered.length === 0 ? <EmptyState icon={<CalendarCheck />} title="No deliverables yet." body="Deliverables will appear after a proposal or campaign is prepared." /> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{filtered.map((item) => <Card key={item.id} className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{label(item.status)}</p><h2 className="mt-2 text-xl font-black">{item.title}</h2><p className="mt-2 text-sm text-slate-400">Due: {item.dueDate || "Not scheduled"}</p><p className="mt-2 text-sm leading-6 text-slate-300">{item.nextAction || "Awaiting sponsor review"}</p><div className="mt-4 flex flex-wrap gap-3"><LinkButton href={`/sponsor/deliverables/${item.id}`} variant="secondary">View</LinkButton><button disabled className="min-h-12 rounded-[8px] border border-white/10 px-4 text-sm font-bold text-slate-500">Release payment disabled</button></div></Card>)}</div>}</div></div></div></SponsorShell>;
}


