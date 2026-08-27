"use client";
import { useEffect, useMemo, useState } from "react";
import { Flag, RefreshCw, X } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button, Card, EmptyState, Field, textareaClass } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Case = Record<string, unknown> & { id: string; caseType: "dispute" | "cancellation" | "verification" };
type Decision = { item: Case; action: "request_information" | "resolve" | "approve_cancellation_review" };
export default function AdminSponsorOperationsPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function load() { setLoading(true); const result = await apiRequest<{ cases: Case[] }>("/api/admin/sponsor-operations"); if (result.ok) setCases(result.data?.cases ?? []); else setMessage(result.message); setLoading(false); }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => filter === "all" ? cases : cases.filter((item) => item.caseType === filter), [cases, filter]);
  function openDecision(item: Case, action: Decision["action"]) { setDecision({ item, action }); setReason(""); setMessage(""); }
  async function submitDecision() {
    if (!decision || reason.trim().length < 10 || saving) return;
    setSaving(true);
    const result = await apiRequest("/api/admin/sponsor-operations", { method: "PATCH", body: JSON.stringify({ caseType: decision.item.caseType, caseId: decision.item.id, action: decision.action, reason }) });
    setSaving(false); setMessage(result.message);
    if (result.ok) { setDecision(null); setReason(""); await load(); }
  }
  return <AdminShell><div className="mx-auto max-w-7xl"><div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">Admin operations</p><h1 className="mt-2 text-3xl font-black">Sponsorship Operations</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Review Sponsor disputes, cancellation exceptions and verification cases without executing external payouts or automatic refunds.</p></div><Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button></div>
    <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Sponsorship operation type">{["all","dispute","cancellation","verification"].map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={"rounded-[8px] px-4 py-2 text-sm font-black capitalize " + (filter === item ? "bg-[var(--gold)] text-black" : "bg-white/5 text-slate-300")}>{item}</button>)}</div>{message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}
    {loading ? <Card className="mt-6 h-48 animate-pulse" /> : visible.length ? <div className="mt-6 grid gap-4">{visible.map((item) => <Card key={item.caseType + "_" + item.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="text-xs font-black uppercase text-[var(--gold)]">{item.caseType}</p><h2 className="mt-2 break-words text-xl font-black">{String(item.category ?? item.brandName ?? item.sponsorshipId ?? item.id)}</h2><p className="mt-2 text-sm text-slate-400">Status: {String(item.status ?? item.verificationStatus ?? "recorded").replaceAll("_", " ")}</p></div>{item.caseType !== "verification" ? <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => openDecision(item, "request_information")}>Request Information</Button><Button variant="secondary" onClick={() => openDecision(item, "resolve")}>Resolve</Button>{item.caseType === "cancellation" ? <Button onClick={() => openDecision(item, "approve_cancellation_review")}>Approve for Finance Review</Button> : null}</div> : null}</div></Card>)}</div> : <EmptyState icon={<Flag />} title="No Sponsor operations in this view" body="Disputes, cancellation exceptions and verification records appear here when recorded." />}
    {decision ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="sponsor-decision-title"><Card className="w-full max-w-xl p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-[var(--gold)]">Recorded admin decision</p><h2 id="sponsor-decision-title" className="mt-2 text-2xl font-black">{decision.action.replaceAll("_", " ")}</h2></div><button type="button" onClick={() => setDecision(null)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-white/10" aria-label="Close decision"><X /></button></div><div className="mt-5"><Field label="Required operational reason"><textarea autoFocus className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the evidence and next operational step." /></Field></div><p className="mt-2 text-xs text-slate-400">This records an internal decision and audit event. It does not execute a payout or automatic refund.</p><div className="mt-6 flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button disabled={saving || reason.trim().length < 10} onClick={() => void submitDecision()}>Record Decision</Button></div></Card></div> : null}
  </div></AdminShell>;
}