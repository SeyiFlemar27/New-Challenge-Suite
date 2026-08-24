"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Clock3, ShieldCheck } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, LinkButton, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { label } from "@/lib/sponsor-collaboration";

type Item = Record<string, unknown> & { id: string };
type ProposalResponse = { proposal: Item; revisions: Item[]; activity: Item[]; internalNotes: Item[] };

export default function SponsorProposalDetailPage() {
  const params = useParams<{ proposalId: string }>();
  const [profile, setProfile] = useState<SponsorShellProfile | null>(null);
  const [proposal, setProposal] = useState<Item | null>(null);
  const [revisions, setRevisions] = useState<Item[]>([]);
  const [activity, setActivity] = useState<Item[]>([]);
  const [notes, setNotes] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [revisionMessage, setRevisionMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");

  async function load() {
    setLoading(true);
    const [profileResult, proposalResult] = await Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<ProposalResponse>(`/api/sponsor/proposals/${params.proposalId}`)]);
    if (profileResult.ok && profileResult.data) setProfile(profileResult.data.sponsorProfile);
    if (proposalResult.ok && proposalResult.data) { setProposal(proposalResult.data.proposal); setRevisions(proposalResult.data.revisions); setActivity(proposalResult.data.activity); setNotes(proposalResult.data.internalNotes); }
    else setNotice(proposalResult.message || "Proposal could not be loaded.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, [params.proposalId]);

  async function takeAction(action: string) {
    const result = await apiRequest(`/api/sponsor/proposals/${params.proposalId}`, { method: "PATCH", body: JSON.stringify({ action, expectedVersion: proposal?.version }) });
    setNotice(result.message); if (result.ok) void load();
  }
  async function addRevision() {
    const result = await apiRequest(`/api/sponsor/proposals/${params.proposalId}/revisions`, { method: "POST", body: JSON.stringify({ status: "countered", expectedVersion: proposal?.version, sponsorMessage: revisionMessage, deliverables: proposal?.deliverables ?? [], budget: Number(proposal?.proposedBudgetCents ?? 0) / 100, startDate: proposal?.startDate, endDate: proposal?.endDate, paymentPreference: proposal?.paymentPreference }) });
    setNotice(result.message); setRevisionMessage(""); if (result.ok) void load();
  }
  async function addNote() {
    const result = await apiRequest("/api/sponsor/internal-notes", { method: "POST", body: JSON.stringify({ relatedEntity: "proposal", relatedEntityId: params.proposalId, body: internalNote }) });
    setNotice(result.message); setInternalNote(""); if (result.ok) void load();
  }

  if (loading) return <SponsorShell profile={profile}><Card className="h-96 animate-pulse bg-slate-100" /></SponsorShell>;
  if (!proposal) return <SponsorShell profile={profile}><Card className="p-6 text-red-800">{notice}</Card></SponsorShell>;
  const status = String(proposal.status ?? "");
  const canNegotiate = ["sent", "viewed", "received", "under_review", "negotiating", "changes_requested"].includes(status);
  const canArchive = ["declined", "withdrawn", "expired", "cancelled", "completed"].includes(status);

  return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><p className="text-sm font-black uppercase tracking-[0.2em] text-amber-700">Proposal detail</p><h1 className="mt-3 break-words text-4xl font-black text-slate-950">{String(proposal.title ?? "Untitled proposal")}</h1><p className="mt-3 max-w-3xl break-words leading-7 text-slate-600">{String(proposal.objective ?? "Proposal objective pending.")}</p></div><div className="flex flex-wrap gap-3"><LinkButton href="/messages" variant="secondary">Message Thread</LinkButton><LinkButton href="/sponsor/proposals" variant="secondary">All Proposals</LinkButton></div></div>
    {notice ? <Card className="mt-6 p-4 text-sm text-slate-600">{notice}</Card> : null}
    <div className="mt-8 grid gap-5 lg:grid-cols-4"><Metric title="Status" value={label(proposal.status)} /><Metric title="Budget" value={`${String(proposal.currency ?? "USD")} ${Number(proposal.proposedBudgetCents ?? 0) / 100}`} /><Metric title="Dates" value={`${String(proposal.startDate || "Start pending")} - ${String(proposal.endDate || "End pending")}`} /><Metric title="Funding" value={label(proposal.fundingStatus, "Not active")} /></div>
    <Card className="mt-8 p-6"><ShieldCheck className="text-amber-700" /><h2 className="mt-3 text-2xl font-black text-slate-950">Available actions</h2><p className="mt-2 text-sm leading-6 text-slate-500">Only actions valid for this state are shown. Funding remains unavailable until both parties accept the same revision and eligibility checks pass.</p><div className="mt-5 flex flex-wrap gap-3">{status === "draft" ? <Button onClick={() => void takeAction("send")}>Send Proposal</Button> : null}{canNegotiate ? <><Button variant="secondary" onClick={() => void addRevision()}>Create Revision</Button><Button onClick={() => void takeAction("accept")}>Accept Current Revision</Button><Button variant="ghost" onClick={() => void takeAction("withdraw")}>Withdraw</Button></> : null}{canArchive ? <Button variant="ghost" onClick={() => void takeAction("archive")}>Archive</Button> : null}{!status ? <p className="text-sm text-slate-500">No action is available.</p> : null}</div></Card>
    <div className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_.9fr]"><Card className="p-6"><h2 className="text-2xl font-black text-slate-950">Proposal summary</h2><div className="mt-5 grid gap-3 md:grid-cols-2"><Info title="Creator" value={linkedRecord(proposal.linkedCreatorName, proposal.linkedCreatorId, "Creator selected")} /><Info title="Challenge" value={linkedRecord(proposal.linkedChallengeTitle, proposal.linkedChallengeId, "Challenge attached")} /><Info title="Payment style" value={paymentLabel(proposal.paymentPreference)} /><Info title="Deliverables" value={deliverableLabels(proposal.deliverables)} /><Info title="Prize contribution" value={money(proposal.prizeContributionCents, proposal.currency)} /><Info title="Creator sponsorship" value={money(proposal.creatorSponsorshipCents, proposal.currency)} /><Info title="Platform fee" value={money(proposal.platformFeeCents, proposal.currency)} /><Info title="Usage rights" value={String(proposal.usageRights || "Not specified")} /></div></Card><Card className="p-6"><h2 className="text-2xl font-black text-slate-950">Create a revision</h2><p className="mt-2 text-sm leading-6 text-slate-600">A new revision preserves prior terms and resets both acceptance records.</p><Field label="Sponsor message"><textarea className={textareaClass} value={revisionMessage} onChange={(event) => setRevisionMessage(event.target.value)} /></Field><Button className="mt-4" disabled={revisionMessage.length < 2 || !canNegotiate} onClick={() => void addRevision()}>Save Revision</Button></Card></div>
    <div className="mt-8 grid gap-8 xl:grid-cols-3"><Card className="p-6 xl:col-span-2"><h2 className="text-2xl font-black text-slate-950">Negotiation timeline</h2><Timeline items={revisions} empty="No revisions yet." /></Card><Card className="p-6"><h2 className="text-2xl font-black text-slate-950">Internal Sponsor notes</h2><p className="mt-2 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Visible only to your Sponsor team.</p><Field label="Private note"><textarea className={textareaClass} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></Field><Button className="mt-3" disabled={internalNote.length < 2} onClick={() => void addNote()}>Save Internal Note</Button><div className="mt-5 space-y-3">{notes.length ? notes.map((note) => <Card key={note.id} className="p-3 text-sm text-slate-600">{String(note.body ?? "")}</Card>) : <p className="text-sm text-slate-500">No internal notes yet.</p>}</div></Card></div>
    <Card className="mt-8 p-6"><h2 className="text-2xl font-black text-slate-950">Activity</h2><Timeline items={activity} empty="No activity yet." /></Card>
  </div></SponsorShell>;
}

function linkedRecord(name: unknown, id: unknown, fallback: string) { return String(name ?? "").trim() || (id ? fallback : "Not attached"); }
function paymentLabel(value: unknown) { return ({ one_time: "One-time payment", milestone_payment: "Milestone payment", prize_funding: "Challenge prize funding", product_service: "Product or service collaboration" } as Record<string, string>)[String(value ?? "")] || "Not selected"; }
function deliverableLabels(value: unknown) { if (!Array.isArray(value) || !value.length) return "No deliverables added"; return value.map((item) => typeof item === "string" ? item : String((item as Record<string, unknown>)?.title ?? "Deliverable")).join(", "); }
function money(value: unknown, currency: unknown) { return `${String(currency ?? "USD")} ${(Number(value ?? 0) / 100).toLocaleString()}`; }
function Metric({ title, value }: { title: string; value: string }) { return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">{title}</p><p className="mt-2 break-words text-xl font-black text-amber-700">{value}</p></Card>; }
function Info({ title, value }: { title: string; value: string }) { return <div className="min-w-0 rounded-[8px] border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</p><p className="mt-1 break-words text-sm font-bold text-slate-950">{value || "Not available yet"}</p></div>; }
function Timeline({ items, empty }: { items: Item[]; empty: string }) { return <div className="mt-5 space-y-3">{items.length ? items.map((item) => <div key={item.id} className="flex gap-3 rounded-[8px] border border-slate-200 bg-slate-50 p-4"><Clock3 size={17} className="mt-1 shrink-0 text-amber-700" /><div className="min-w-0"><p className="break-words font-black">{label(item.status ?? item.action)}</p><p className="mt-1 break-words text-sm text-slate-500">{String(item.sponsorMessage ?? item.creatorMessage ?? item.action ?? "Activity record")}</p><p className="mt-1 text-xs text-slate-500">{String(item.createdAt ?? item.updatedAt ?? "Timestamp pending")}</p></div></div>) : <p className="text-sm text-slate-500">{empty}</p>}</div>; }
