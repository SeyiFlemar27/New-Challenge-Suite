"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Megaphone, XCircle } from "lucide-react";
import { Button, Card, EmptyState, inputClass, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type Campaign = Record<string, any> & { id: string };

export function SponsorCampaignReview() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");

  async function load() {
    const result = await apiRequest<{ campaigns: Campaign[] }>("/api/admin/sponsor-campaigns");
    setLoading(false);
    if (!result.ok || !result.data) return setNotice(result.message || "Sponsor campaigns could not be loaded.");
    setCampaigns(result.data.campaigns);
    setNotice("");
  }

  useEffect(() => {
    let active = true;
    void apiRequest<{ campaigns: Campaign[] }>("/api/admin/sponsor-campaigns").then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok || !result.data) return setNotice(result.message || "Sponsor campaigns could not be loaded.");
      setCampaigns(result.data.campaigns);
    });
    return () => { active = false; };
  }, []);

  async function decide(campaign: Campaign, action: "approve_placement" | "reject_placement") {
    const reason = reasons[campaign.id]?.trim() ?? "";
    if (reason.length < 8) return setNotice("Enter at least 8 characters explaining the placement decision.");
    const label = action === "approve_placement" ? "Approve this funded placement and activate campaign visibility?" : "Reject placement and send this funded campaign to refund review? Confirmed prize funding will not be changed.";
    if (!window.confirm(label)) return;
    setBusyId(campaign.id);
    const result = await apiRequest("/api/admin/sponsor-campaigns", { method: "PATCH", body: JSON.stringify({ id: campaign.id, action, reason }) });
    setBusyId("");
    setNotice(result.message);
    if (result.ok) await load();
  }

  return <>
    <PageTitle title="Sponsor Campaign Review" subtitle="Review confirmed, organization-linked sponsorship funding before brand placement becomes visible. Decisions never move or release funds." icon={<Megaphone />} />
    {notice ? <Card className="mt-6 p-4 text-sm" role="status">{notice}</Card> : null}
    {loading ? <div className="mt-7 grid gap-4">{[0, 1, 2].map((item) => <Card key={item} className="h-40 animate-pulse" />)}</div> : campaigns.length ? <div className="mt-7 grid gap-4">{campaigns.map((campaign) => <Card key={campaign.id} className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-[var(--gold)]">Confirmed funding · placement review</p><h2 className="mt-2 text-xl font-black">{String(campaign.challengeTitle ?? campaign.challengeId ?? "Challenge sponsorship")}</h2><p className="mt-2 text-sm text-slate-500">Sponsor organization: {String(campaign.sponsorOrganizationId ?? "Unavailable")}</p><p className="mt-2 text-sm font-bold">{formatMoney(campaign.amountCents, campaign.currency)} · {Array.isArray(campaign.placements) ? campaign.placements.map(String).join(", ") : "No placements"}</p><p className="mt-2 break-all text-sm text-slate-500">CTA: {String(campaign.ctaText ?? "")}{campaign.ctaUrl ? ` · ${String(campaign.ctaUrl)}` : ""}</p><p className="mt-2 text-sm text-slate-500">Agreement {String(campaign.agreementId ?? "missing")} · funding {String(campaign.fundingStatus ?? "unknown")}</p></div><div className="flex flex-wrap gap-2"><Button disabled={Boolean(busyId)} onClick={() => void decide(campaign, "approve_placement")}><CheckCircle2 size={16} /> Approve Placement</Button><Button disabled={Boolean(busyId)} variant="destructive" onClick={() => void decide(campaign, "reject_placement")}><XCircle size={16} /> Reject Placement</Button></div></div>
      <label className="mt-5 block text-sm font-bold">Required decision reason<input className={`${inputClass} mt-2`} minLength={8} maxLength={1200} value={reasons[campaign.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [campaign.id]: event.target.value }))} placeholder="Record the placement review basis" /></label>
    </Card>)}</div> : <Card className="mt-7"><EmptyState icon={<Megaphone />} title="No funded placements awaiting review" body="Only confirmed agreement funding appears in this queue. Pending checkout sessions are not campaigns." /></Card>}
  </>;
}

function formatMoney(value: unknown, currency: unknown) {
  const amount = Number(value ?? 0) / 100;
  if (!Number.isFinite(amount)) return "Amount unavailable";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency ?? "USD").toUpperCase() }).format(amount); }
  catch { return `${amount.toFixed(2)} ${String(currency ?? "USD")}`; }
}
