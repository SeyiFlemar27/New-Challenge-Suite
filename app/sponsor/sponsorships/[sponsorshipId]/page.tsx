"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { SponsorShell } from "@/components/sponsor/sponsor-shell";
import { Button, Card, Field, LinkButton, inputClass, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { formatMoney, label } from "@/lib/sponsor-finance";

type Sponsorship = { id: string; title?: string; proposalId?: string; status?: string; amountCents?: number; currency?: string; sponsorRole?: string; refundStatus?: string; activatedAt?: string; version?: number };
const issueCategories = ["missing_deliverable", "placement_issue", "analytics_reporting", "funding_finance", "sponsorship_terms", "other"];

export default function SponsorshipDetailPage() {
  const params = useParams<{ sponsorshipId: string }>();
  const [item, setItem] = useState<Sponsorship | null>(null);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [category, setCategory] = useState("missing_deliverable");
  const [explanation, setExplanation] = useState("");
  async function load() { const result = await apiRequest<{ sponsorship: Sponsorship }>(`/api/sponsor/sponsorships/${params.sponsorshipId}`); if (result.ok) setItem(result.data?.sponsorship ?? null); else setNotice(result.message); }
  useEffect(() => { void load(); }, [params.sponsorshipId]);
  async function act(action: string, extra: Record<string, unknown> = {}) { if (!item) return; const result = await apiRequest(`/api/sponsor/sponsorships/${item.id}`, { method: "PATCH", body: JSON.stringify({ action, expectedVersion: item.version ?? 1, ...extra }) }); setNotice(result.message); if (result.ok) await load(); }
  if (!item) return <SponsorShell><Card className="mx-auto h-80 max-w-5xl animate-pulse bg-slate-100" />{notice ? <p className="mt-4 text-center text-sm text-red-700">{notice}</p> : null}</SponsorShell>;
  const activated = Boolean(item.activatedAt) || ["active", "live", "completion_review"].includes(String(item.status));
  return <SponsorShell><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Sponsorship</p><h1 className="mt-2 text-4xl font-black text-slate-950">{item.title || item.proposalId || "Sponsorship workspace"}</h1><p className="mt-3 text-slate-600">Manage completion and exception states without bypassing funding or admin review.</p></div><LinkButton href="/sponsor/sponsorships" variant="secondary">All Sponsorships</LinkButton></div>{notice ? <Card className="mt-6 p-4 text-sm text-slate-700">{notice}</Card> : null}<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Status" value={label(item.status)} /><Metric title="Funding" value={formatMoney(item.amountCents, item.currency)} /><Metric title="Position" value={label(item.sponsorRole)} /><Metric title="Refund" value={label(item.refundStatus)} /></div><div className="mt-8 grid gap-6 lg:grid-cols-2"><Card className="p-6"><AlertTriangle className="text-amber-700" /><h2 className="mt-3 text-xl font-black">Report an issue</h2><p className="mt-2 text-sm leading-6 text-slate-600">Issues pause completion and create an auditable review record.</p><div className="mt-5 grid gap-4"><Field label="Issue category"><select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>{issueCategories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></Field><Field label="Explanation"><textarea className={textareaClass} value={explanation} onChange={(event) => setExplanation(event.target.value)} /></Field><Button variant="secondary" disabled={explanation.trim().length < 10} onClick={() => void act("report_issue", { category, explanation })}>Report Issue</Button></div></Card><Card className="p-6"><XCircle className="text-red-700" /><h2 className="mt-3 text-xl font-black">Cancel sponsorship</h2><p className="mt-2 text-sm leading-6 text-slate-600">{activated ? "After activation, cancellation requires policy and admin review. Funds do not move automatically." : "Before activation, eligible uncommitted reserved funds return to the Sponsor Wallet and reserved placements are released."}</p><div className="mt-5 grid gap-4"><Field label="Reason"><textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><label className="flex items-start gap-3 text-sm font-bold text-slate-700"><input className="mt-1" type="checkbox" checked={confirmCancel} onChange={(event) => setConfirmCancel(event.target.checked)} /> I understand the placement, creator, wallet, refund, and prize impact.</label><Button variant="destructive" disabled={!confirmCancel || reason.trim().length < 10} onClick={() => void act("request_cancellation", { reason })}>Request Cancellation</Button></div></Card></div>{item.status === "completion_review" ? <Card className="mt-6 p-6"><CheckCircle2 className="text-emerald-700" /><h2 className="mt-3 text-xl font-black">Completion review</h2><p className="mt-2 text-sm text-slate-600">Confirm only after reviewing the final report and required deliverables.</p><Button className="mt-5" onClick={() => void act("confirm_completion")}>Confirm Completion</Button></Card> : null}</div></SponsorShell>;
}

function Metric({ title, value }: { title: string; value: string }) { return <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{title}</p><p className="mt-2 break-words font-bold text-slate-950">{value}</p></Card>; }
