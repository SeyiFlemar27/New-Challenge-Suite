"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Archive, Copy, Eye, FilePenLine, MoreVertical, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/api/client";

export function CampaignActionsMenu({ campaign, onChanged }: { campaign: Record<string, any>; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const status = String(campaign.status ?? "draft").toLowerCase();
  useEffect(() => {
    function close(event: MouseEvent) { if (!ref.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function patchStatus(nextStatus: string, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true);
    const result = await apiRequest(`/api/sponsor/campaigns/${campaign.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
    setBusy(false);
    setOpen(false);
    if (result.ok) onChanged();
  }
  async function duplicate() {
    setBusy(true);
    const result = await apiRequest("/api/sponsor/campaigns", { method: "POST", body: JSON.stringify({ ...campaign, id: undefined, campaignTitle: `${campaign.campaignTitle || "Campaign brief"} copy`, status: "draft" }) });
    setBusy(false);
    setOpen(false);
    if (result.ok) onChanged();
  }

  return <div className="relative" ref={ref}><button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700 hover:border-amber-300" aria-label={`Open actions for ${campaign.campaignTitle || "campaign brief"}`} aria-expanded={open} aria-haspopup="menu"><MoreVertical size={18} /></button>{open ? <div role="menu" className="absolute bottom-full right-0 z-40 mb-2 w-60 rounded-[8px] border border-slate-200 bg-white p-2 shadow-xl"><MenuLink href={`/sponsor/campaigns/${campaign.id}`} label="View campaign brief" icon={<Eye size={16} />} /><MenuLink href={`/sponsor/campaigns/${campaign.id}/edit`} label="Edit campaign brief" icon={<FilePenLine size={16} />} /><MenuButton label="Duplicate" icon={<Copy size={16} />} disabled={busy} onClick={() => void duplicate()} />{status === "archived" ? <MenuButton label="Restore as draft" icon={<RotateCcw size={16} />} disabled={busy} onClick={() => void patchStatus("draft")} /> : <MenuButton label="Archive" icon={<Archive size={16} />} disabled={busy} onClick={() => void patchStatus("archived", "Archive this campaign brief? Its history will be retained.")} />}</div> : null}</div>;
}
function MenuLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) { return <Link role="menuitem" href={href} className="flex min-h-10 items-center gap-3 rounded-[6px] px-3 text-sm font-bold text-slate-700 hover:bg-amber-50">{icon}{label}</Link>; }
function MenuButton({ label, icon, disabled, onClick }: { label: string; icon: React.ReactNode; disabled: boolean; onClick: () => void }) { return <button role="menuitem" type="button" disabled={disabled} onClick={onClick} className="flex min-h-10 w-full items-center gap-3 rounded-[6px] px-3 text-left text-sm font-bold text-slate-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50">{icon}{label}</button>; }
