"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Archive, Bell, Copy, Eye, FilePenLine, MessageSquare, MoreVertical, RotateCcw, Trash2, WalletCards, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/api/client";

type Proposal = Record<string, any> & { id: string };

export function ProposalActionsMenu({ proposal, onChanged }: { proposal: Proposal; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const status = String(proposal.status ?? "draft");
  const reminderAvailable = ["sent", "viewed", "received", "under_review", "negotiating", "changes_requested"].includes(status);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function patch(statusValue: string, message: string, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true); setNotice("");
    const result = await apiRequest(`/api/sponsor/proposals/${proposal.id}`, { method: "PATCH", body: JSON.stringify({ status: statusValue }) });
    setBusy(false); setNotice(result.message || message); setOpen(false);
    if (result.ok) onChanged();
  }
  async function duplicate() {
    setBusy(true); setNotice("");
    const result = await apiRequest("/api/sponsor/proposals", { method: "POST", body: JSON.stringify({ ...proposal, title: `Copy of ${proposal.title || "proposal"}`, campaignId: proposal.linkedCampaignId, creatorId: proposal.linkedCreatorId, challengeId: proposal.linkedChallengeId, budget: Number(proposal.proposedBudgetCents ?? 0) / 100, status: "draft" }) });
    setBusy(false); setNotice(result.message); setOpen(false); if (result.ok) onChanged();
  }
  async function remind() {
    setBusy(true); setNotice("");
    const result = await apiRequest(`/api/sponsor/proposals/${proposal.id}/activity`, { method: "POST", body: "{}" });
    setBusy(false); setNotice(result.message); setOpen(false); if (result.ok) onChanged();
  }

  return <div className="relative" ref={ref}><button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700 hover:border-amber-300" aria-label={`Open actions for ${proposal.title || "proposal"}`} aria-expanded={open} aria-haspopup="menu"><MoreVertical size={18} /></button>{open ? <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-[8px] border border-slate-200 bg-white p-2 shadow-xl"><ActionLink href={`/sponsor/proposals/${proposal.id}`} label="View proposal" icon={<Eye size={16} />} />{status === "draft" ? <ActionLink href={`/sponsor/proposals/${proposal.id}`} label="Edit draft" icon={<FilePenLine size={16} />} /> : null}{["accepted", "funded", "live", "completed"].includes(status) ? <ActionLink href="/messages" label="View conversation" icon={<MessageSquare size={16} />} /> : null}{status === "accepted" && proposal.linkedChallengeId ? <ActionLink href={`/sponsor/funding/${proposal.linkedChallengeId}/checkout`} label="Fund proposal" icon={<WalletCards size={16} />} /> : null}{status === "completed" ? <ActionLink href="/sponsor/reports" label="View report" icon={<Eye size={16} />} /> : null}{reminderAvailable ? <ActionButton label="Send reminder" icon={<Bell size={16} />} disabled={busy} onClick={() => void remind()} /> : null}{reminderAvailable ? <ActionButton label="Withdraw proposal" icon={<XCircle size={16} />} disabled={busy} onClick={() => void patch("withdrawn", "Proposal withdrawn.", "Withdraw this proposal? The activity history will be retained.")} /> : null}<ActionButton label="Duplicate" icon={<Copy size={16} />} disabled={busy} onClick={() => void duplicate()} />{["archived", "cancelled"].includes(status) ? <ActionButton label="Restore as draft" icon={<RotateCcw size={16} />} disabled={busy} onClick={() => void patch("draft", "Proposal restored as a draft.")} /> : status === "draft" ? <ActionButton label="Delete draft" icon={<Trash2 size={16} />} danger disabled={busy} onClick={() => void patch("archived", "Draft archived.", "Delete this draft? It will be safely archived and its history retained.")} /> : <ActionButton label="Archive" icon={<Archive size={16} />} disabled={busy} onClick={() => void patch("archived", "Proposal archived.", "Archive this proposal? Its history will be retained.")} />}</div> : null}{notice ? <span className="sr-only" aria-live="polite">{notice}</span> : null}</div>;
}
function ActionLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) { return <Link role="menuitem" href={href} className="flex min-h-10 items-center gap-3 rounded-[8px] px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">{icon}{label}</Link> }
function ActionButton({ label, icon, onClick, disabled, danger = false }: { label: string; icon: React.ReactNode; onClick: () => void; disabled: boolean; danger?: boolean }) { return <button role="menuitem" type="button" onClick={onClick} disabled={disabled} className={`flex min-h-10 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold hover:bg-slate-50 disabled:opacity-50 ${danger ? "text-red-700" : "text-slate-700"}`}>{icon}{label}</button> }
