"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Clock3, ShieldCheck } from "lucide-react";
import { SponsorShell, type SponsorShellProfile } from "@/components/sponsor/sponsor-shell";
import { Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { label } from "@/lib/sponsor-collaboration";

type Item = Record<string, unknown> & { id: string };
type ProposalResponse = { proposal: Item; revisions: Item[]; activity: Item[] };

export default function SponsorProposalDetailPage() {
  const params = useParams<{ proposalId: string }>();
  const query = useQuery({ queryKey: ["sponsor-proposal-history", params.proposalId], queryFn: async () => Promise.all([apiRequest<{ sponsorProfile: SponsorShellProfile }>("/api/sponsor/profile"), apiRequest<ProposalResponse>(`/api/sponsor/proposals/${params.proposalId}`)]) });
  const profile = query.data?.[0].data?.sponsorProfile ?? null;
  const proposal = query.data?.[1].data?.proposal ?? null;
  const revisions = query.data?.[1].data?.revisions ?? [];
  const activity = query.data?.[1].data?.activity ?? [];
  const notice = query.data?.[1].ok ? "" : query.data?.[1].message || query.error?.message || "Proposal could not be loaded.";

  if (query.isLoading) return <SponsorShell profile={profile}><Card className="h-96 animate-pulse bg-slate-100" /></SponsorShell>;
  if (!proposal) return <SponsorShell profile={profile}><Card className="p-6 text-red-800">{notice}</Card></SponsorShell>;
  return <SponsorShell profile={profile}><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><p className="text-sm font-black uppercase tracking-[0.2em] text-amber-700">Historical proposal</p><h1 className="mt-3 break-words text-4xl font-black text-slate-950">{String(proposal.title ?? "Untitled proposal")}</h1><p className="mt-3 max-w-3xl break-words leading-7 text-slate-600">{String(proposal.objective ?? "Proposal objective pending.")}</p></div><div className="flex flex-wrap gap-3"><LinkButton href="/sponsor/campaigns/create" variant="secondary">Create Campaign Brief</LinkButton><LinkButton href="/sponsor/proposals" variant="secondary">All Historical Proposals</LinkButton></div></div>
    {notice ? <Card className="mt-6 p-4 text-sm text-slate-600">{notice}</Card> : null}
    <div className="mt-8 grid gap-5 lg:grid-cols-4"><Metric title="Status" value={label(proposal.status)} /><Metric title="Budget" value={`${String(proposal.currency ?? "USD")} ${Number(proposal.proposedBudgetCents ?? 0) / 100}`} /><Metric title="Dates" value={`${String(proposal.startDate || "Start pending")} - ${String(proposal.endDate || "End pending")}`} /><Metric title="Funding" value={label(proposal.fundingStatus, "Not active")} /></div>
    <Card className="mt-8 p-6"><ShieldCheck className="text-amber-700" /><h2 className="mt-3 text-2xl font-black text-slate-950">Historical record</h2><p className="mt-2 text-sm leading-6 text-slate-500">This proposal is preserved for reference. It cannot be edited, negotiated, accepted, funded, or used to initiate a new sponsorship relationship.</p></Card>
    <div className="mt-8"><Card className="p-6"><h2 className="text-2xl font-black text-slate-950">Proposal summary</h2><div className="mt-5 grid gap-3 md:grid-cols-2"><Info title="Creator" value={linkedRecord(proposal.linkedCreatorName, proposal.linkedCreatorId, "Creator selected")} /><Info title="Challenge" value={linkedRecord(proposal.linkedChallengeTitle, proposal.linkedChallengeId, "Challenge attached")} /><Info title="Payment style" value={paymentLabel(proposal.paymentPreference)} /><Info title="Deliverables" value={deliverableLabels(proposal.deliverables)} /><Info title="Prize contribution" value={money(proposal.prizeContributionCents, proposal.currency)} /><Info title="Creator sponsorship" value={money(proposal.creatorSponsorshipCents, proposal.currency)} /><Info title="Platform fee" value={money(proposal.platformFeeCents, proposal.currency)} /><Info title="Usage rights" value={String(proposal.usageRights || "Not specified")} /></div></Card></div>
    <Card className="mt-8 p-6"><h2 className="text-2xl font-black text-slate-950">Negotiation timeline</h2><Timeline items={revisions} empty="No revisions yet." /></Card>
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
