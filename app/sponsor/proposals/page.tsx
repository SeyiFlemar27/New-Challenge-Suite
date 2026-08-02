"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, EmptyState, LinkButton, inputClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { label, proposalStatuses } from "@/lib/sponsor-collaboration";

type Proposal = Record<string, any>;

export default function SponsorProposalsPage() {
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<{ proposals: Proposal[] }>("/api/sponsor/proposals")]).then(([profileResult, proposalResult]) => { if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile); if (proposalResult.ok && proposalResult.data) setProposals(proposalResult.data.proposals); else setError(proposalResult.message || "Proposals could not be loaded."); setLoading(false); }); }, []);
  const filtered = useMemo(() => proposals.filter((item) => (status === "all" || item.status === status) && (!query || [item.title, item.objective, item.linkedCreatorId, item.linkedChallengeId].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))), [proposals, query, status]);
  return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--gold)]">Proposal Center</p><h1 className="mt-3 break-words text-4xl font-black">Sponsor proposals</h1><p className="mt-3 max-w-3xl break-words leading-7 text-slate-600">Create proposal drafts, review status, and keep sponsorship conversations separate from contracts and campaign funding.</p></div><LinkButton href="/sponsor/proposals/new">Create Proposal</LinkButton></div><Card className="mt-8 p-4"><div className="grid gap-3 lg:grid-cols-[1fr_260px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search proposals, creators, challenges" /></div><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{proposalStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div></Card>{error ? <Card className="mt-6 border-red-500/20 border border-red-200 bg-red-50 p-5 text-red-800">{error}</Card> : null}{loading ? <div className="mt-8 grid gap-5 lg:grid-cols-3">{[0,1,2].map((item) => <Card key={item} className="h-64 animate-pulse bg-slate-100" />)}</div> : filtered.length === 0 ? <EmptyState icon={<FileText />} title="No proposals yet." body="Create a campaign brief, discover creators, or browse challenges to begin sponsorship conversations." action={<LinkButton href="/sponsor/proposals/new">Create Proposal</LinkButton>} /> : <div className="mt-8 grid gap-4">{filtered.map((proposal) => <Card key={proposal.id} className="p-5"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)_auto] lg:items-center"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">{label(proposal.status)}</p><h2 className="mt-2 break-words text-2xl font-black">{proposal.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{proposal.objective || "Objective pending."}</p></div><div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3"><Info label="Budget" value={`${proposal.currency ?? "USD"} ${proposal.proposedBudgetCents ? proposal.proposedBudgetCents / 100 : 0} planned`} /><Info label="Deliverables" value={proposal.deliverablesCount} /><Info label="Deadline" value={proposal.endDate || "-"} /></div><div className="flex flex-wrap gap-3 lg:justify-end"><LinkButton href={`/sponsor/proposals/${proposal.id}`} variant="secondary">View Proposal</LinkButton><button disabled className="min-h-12 rounded-[8px] border border-slate-200 px-4 text-sm font-bold text-slate-500">Setup required</button></div></div></Card>)}</div>}</div></SponsorShell>;
}
function Info({ label: title, value }: { label: string; value: any }) { return <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</p><p className="mt-1 break-words font-bold text-slate-950">{value || "Not available yet"}</p></div>; }


